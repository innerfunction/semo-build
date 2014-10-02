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
                emit( doc.$feedID, doc );
            }
        }
    },
    // Find feed posts by feed ID.
    // Feed posts have a $feedID property but no $feedRecord value.
    'feed-post': {
        map: function( doc ) {
            if( doc.$feedID && !doc.$feedRecord ) {
                emit( doc.$feedID, doc );
            }
        }
    },
    // Find all builds for a specific feed ID.
    'builds': {
        map: function( doc ) {
            if( doc.type == 'build-record') {
                emit([ doc.feedID, doc.time ], doc );
            }
        }
    }
}

// Make the download script's db client.
// Returns a thin wrapper around the default semo db client; the wrapper hides some
// of the request details, and returns q promises.
function makeCDBClient( db ) {
    return {
        get: function( id ) {
            return q.nfcall( db.get, id );
        },
        create: function( doc ) {
            return q.nfcall( db.create, doc );
        },
        update: function( doc ) {
            return q.nfcall( db.update, doc._id||doc.id, doc );
        },
        bulkUpdate: function( docs ) {
            return q.nfcall( db.bulkUpdate, { docs: docs });
        },
        remove: function( doc ) {
            return q.nfcall( db.remove, doc._id||doc.id );
        },
        // Query a CouchDB view document. Documents are included in the response.
        view: function( docid, viewid, key ) {
            key = JSON.stringify( key );
            return q.nfcall( db.view, docid, viewid, { key: key, include_docs: 'true' })
            .then(function( args ) {
                return args[0];
            });
        },
        // Get the download record the specified feed ID.
        // Returns the existing record if found, otherwise creates a new record.
        getFeedRecord: function( feedID ) {
			var client = this;
            return this.view( CDBDesignDocID, 'feed-record', feedID )
            .then(function( data ) {
                if( data.rows.length > 0 ) {
                    return data.rows[0].doc;
                }
                else return client.create({
                    $feedID: feedID,
                    $feedRecord: true
                });
            });
        },
        // Return a list of feed posts for the specified feed ID.
        getFeedPosts: function( feedID ) {
            return this.view( CDBDesignDocID, 'feed-post', feedID )
            .then(function( data ) {
                return data.rows;
            });
        },
        // Return a list of builds for the specified feed ID.
        // Builds are returned in chronological order.
        getFeedBuilds: function( feedID ) {
            return this.view( CDBDesignDocID, 'builds', [ feedID ])
            .then(function( data ) {
                return data.rows.map(function( row ) {
                    return row.doc;
                });
            });
        }
    }
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
