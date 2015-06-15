var Log = require('log4js').getLogger('semo-build.cdb');
var q = require('semo/lib/q');

var CDBDesignDocID = 'eventpac-build';

// CouchDB views used by the build functions.
var CDBViews = {
    // Find feed records by ID.
    // Feed record docs have a $feedRecord: true property.
    'feed-record': {
        map: function( doc ) {
            if( doc.$feedRecord ) {
                emit( doc.$feedID, null );
            }
        }
    },
    // Find feed posts by feed ID.
    // Feed posts have a $feedID property but no $feedRecord value.
    'feed-post': {
        map: function( doc ) {
            if( doc.$feedID && !doc.$feedRecord ) {
                emit( doc.$feedID, null );
            }
        }
    },
    // Find feed posts by feed ID + post ID.
    // The post ID is a user-space ID separate from the CouchDB ID.
    'feed-post-by-id': {
        map: function( doc ) {
            if( doc.$feedID && !doc.$feedRecord && doc.$id ) {
                emit([ doc.$feedID, doc.$id ], null );
            }
        }
    },
    // Find all builds for a specific feed ID.
    'builds': {
        map: function( doc ) {
            if( doc.type == 'build-record') {
                emit( doc.feedID, null );
            }
        },
        reduce: function( keys, values ) {
            return true;
        }
    }
}

// Make the download script's db client.
// Returns a thin wrapper around the default semo db client; the wrapper hides some
// of the request details, and returns q promises.
function makeCDBClient( db ) {
    var cdb = {
        get: function( id ) {
            return q.nfcall( db.get, id );
        },
        create: function( doc ) {
            return q.nfcall( db.create, doc );
        },
        update: function( doc ) {
            return q.nfcall( db.update, doc._id, doc );
        },
        bulkUpdate: function( docs ) {
            return q.nfcall( db.bulkUpdate, docs );
        },
        remove: function( doc ) {
            return q.nfcall( db.remove, doc._id );
        },
        // Query a CouchDB view document. Documents are included in the response.
        view: function( docid, viewid, key, params ) {
            params = params||{};
            if( key !== undefined ) {
                params.key = JSON.stringify( key );
            }
            params.include_docs = params.reduce == 'true' ? 'false' : 'true';
            return q.nfcall( db.view, docid, viewid, params )
            .then(function( args ) {
                return args[0];
            });
        },
        // Get the download record the specified feed ID.
        // Returns the existing record if found, otherwise creates a new record.
        getFeedRecord: function( feedID, create ) {
            if( create === undefined ) create = true;
			var client = this;
            return this.view( CDBDesignDocID, 'feed-record', feedID )
            .then(function resolveRecord( data ) {
                if( data.rows.length > 0 ) {
                    return data.rows[0].doc;
                }
                else if( create ) {
                    var doc = {
                        $feedID: feedID,
                        $feedRecord: true
                    };
                    return client.create( doc )
                    .then(function newRecord( res ) {
                        var _doc = res[0];
                        doc._id = _doc.id;
                        doc._rev = _doc.rev;
                        return doc;
                    });
                }
                else return q.Q();
            });
        },
        // Test whether a feed record exists for the specified feed ID.
        hasFeedRecord: function( feedID ) {
            var client = this;
            return this.view( CDBDesignDocID, 'feed-record', feedID )
            .then(function( data ) {
                return data.rows.length > 0;
            });
        },
        // Return a list of feed posts for the specified feed ID.
        getFeedPosts: function( feedID ) {
            return this.view( CDBDesignDocID, 'feed-post', feedID )
            .then(function( data ) {
                // Post data will have have an id property renamed to $id when saving to the
                // database (see feedcx.js, Context.write() method); undo this change when
                // presenting the data back to user land.
                return data.rows.map(function( row ) {
                    var doc = row.doc;
                    doc.id = doc.$id;
                    return doc;
                });
            });
        },
        // Return a feed post specified by the user-space ID.
        getFeedPost: function( feedID, postID ) {
            return this.view( CDBDesignDocID, 'feed-post-by-id', [ feedID, postID ] )
            .then(function( data ) {
                return data.rows.length > 0 && data.rows[0].doc;
            });
        },
        // Return a list of builds for the specified feed ID.
        // Builds are returned in chronological order.
        getFeedBuilds: function( feedID ) {
            return this.view( CDBDesignDocID, 'builds', feedID, { reduce: 'false' })
            .then(function( data ) {
                return data.rows
                .map(function( row ) {
                    return row.doc;
                })
                // Sort by build date, in decreasing date order.
                .sort(function( b1, b2 ) {
                    return b1.time < b2.time ? 1 : b1.time > b2.time ? -1 : 0;
                });
            });
        },
        // Get the most recent build for a feed.
        getMostRecentFeedBuild: function( feedID ) {
            return this.getFeedBuilds( feedID )
            .then(function getFirstBuild( builds ) {
                return builds && builds[0];
            });
        },
        // Return a list of unique feed IDs for all builds.
        getUniqueBuildFeedIDs: function() {
            return this.view( CDBDesignDocID, 'builds', undefined, { reduce: 'true', group: 'true' })
            .then(function( data ) {
                return data.rows.map(function( row ) {
                    return row.key;
                });
            });
        },
        // Load a persisted build queue from the database. Returns an empty queue if no build queue doc
        // is found.
        loadBuildQueue: function( buildQueue ) {
            return this.get('semo-build-queue')
            .then(function readQueue( res ) {
                var doc = res && res[0];
                buildQueue.queue = (doc && doc.queue)||[];
            })
            .fail(function readQueueError( err ) {
                if( err.error == 'not_found' ) {
                    buildQueue.queue = [];
                }
                else throw err;
            });
        },
        // Save a build queue to the database.
        saveBuildQueue: function( buildQueue ) {
            var client = this;
            return this.get('semo-build-queue')
            .then(function writeQueue( res ) {
                var doc = res[0];
                doc.queue = buildQueue.queue;
                return client.update( doc, doc._id );
            })
            .fail(function createQueue( err ) {
                if( err.error == 'not_found' ) {
                    var doc = {
                        _id: 'semo-build-queue',
                        queue: buildQueue.queue
                    };
                    return client.create( doc );
                }
                else throw err;
            });
        }
    }
    return cdb;
}

// Check that a couchdb design document is up-to-date with the correct view definitions,
// and refresh if necessary.
function refreshDesignDoc( config ) {
    var dp = q.defer();
    Log.debug('Refreshing design document %s...', CDBDesignDocID );
    var dao = config.get('components.dao');
    if( !dao ) {
        Log.error('DAO component not found');
        dp.reject();
    }
    else if( !dao.db ) {
        Log.error('DB connection not found on DAO component');
        dp.reject();
    }
    else dao.db.updateDesign( CDBDesignDocID , { views: CDBViews }, function done( ok ) {
        if( ok ) {
            Log.debug('Refreshed design document %s', CDBDesignDocID );
            dp.resolve( dao.db );
        }
        else {
            Log.error('Failed to update design document %s', CDBDesignDocID );
            dp.reject();
        }
    });
    return dp.promise;
}

// Initialize the Couch DB connection and return a DB client.
// @config: Semo configuration. Must have a reference to the DAO component.
exports.init = function( config ) {
    return refreshDesignDoc( config )
    .then(function( db ) {
        return makeCDBClient( db );
    });
}
