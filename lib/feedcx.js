var Log = require('log4js').getLogger('semo-build.download.cx');
var q = require('semo/lib/q');
var inherits = require('util').inherits;
var format = require('util').format;
var http = require('./http');
var dformat = require('dateformat');
var dpeq = require('deep-equal');

// Merge the properties of one or more objects into a single object.
function merge() {
    var result = {};
    for( var i = 0; i < arguments.length; i++ ) {
        var obj = arguments[i];
        if( obj instanceof AsyncData ) {
            obj = obj._data;
        }
        for( var id in obj ) {
            result[id] = obj[id];
        }
    }
    return result;
}

// Return async data's JSON representation. Returns the _data property.
AsyncData.prototype.toJSON = function() {
    return this._data;
}
// An object handling asynchronously resolved data.
function AsyncData() {}

// Download feed data from a URL over HTTP.
// @arguments: A URL string, with optional format string placeholders,
//             followed by a value list.
// Returns a Feed object representing the downloaded data.
Context.prototype.get = function() {
    var url = format.apply( this, arguments );
    var cx = this;
    var feed = new Feed( this, url );
    this.add2q(function() {
        Log.debug('GET %s', url );
        return http.get( url )
        .then(function( data ) {
            Log.debug(' -> %s', url );
            feed._data = data;
            cx.$lastDownload = new Date(); // This copied to _record when it is saved.
        });
    });
    return feed;
}
// Get the time of the last (previous) download, as a formatted string value.
// @format: Any format string supported by the 'dateformat' library. Defaults to isoDateTime.
Context.prototype.lastDownload = function( format ) {
    return dformat( this._record.$lastDownload, format||'isoDateTime' );
}
// Apply the current build scope to an object.
Context.prototype.applyBuildScope = function( obj ) {
    obj.$buildScope = this._lastBuildID;
}
// Test whether an object has the current build scope.
Context.prototype.hasCurrentBuildScope = function( obj ) {
    return obj.$buildScope == this._lastBuildID;
}
// Update the feed download record.
// @data: Optional additional values to merge into the feed record.
Context.prototype.record = function( data ) {
    var cx = this;
    this.add2q(function() {
        var record = cx._record;
        // Test for changes between the current and new record data.
        var equal = true;
        // Iterate over each item in the new data.
        for( var id in data ) {
            // Compare using deep equality whether the new data item equals the
            // the corresponding data item currently on the record.
            equal &= dpeq( data[id], record[id] );
            if( !equal ) {
                break;
            }
        }
        // Set the context's dirty flag.
        cx._dirty = !equal;
        // Merge the data record and save to db. (This is done regardless of whether dirty or
        // not, to ensure that the lastDownload property is kept up-to-date).
        var retryCount = 20;
        function updateFeedRecord() {
            // Re-load the feed record before merging data and attempting to save.
            // This is to try and minimize retries due to update conflicts.
            return cx._db.getFeedRecord( record.$feedID, false )
            .then(function( record ) {
                record = merge( record, data, { '$lastDownload': cx.$lastDownload });
                return cx._db.update( record )
                .fail(function( e ) {
                    if( e.error == 'conflict' ) {
                        if( retryCount > 0 ) {
                            retryCount --;
                            // CouchDB document udpate conflict - try loading and saving again.
                            return updateFeedRecord();
                        }
                        else {
                            Log.error('Failed to update feed record for %s', record.$feedID );
                        }
                    }
                    return q.reject( e );
                });
            });
        }
        return updateFeedRecord();
    });
    return this;
}
// Write data posts to the feed database.
// @posts: A Posts object representing the post data to write.
Context.prototype.write = function( posts ) {
    var cx = this;
	this.add2q(function() {
        var feedID = cx._record.$feedID;
        var updates = posts._data
        .filter(function filter( post ) {
            // Filter out and null/undefined/false posts (due to missing data).
            return !!post;
        })
        .map(function map( post ) {
            post.$feedID = feedID;
            return function() {
                // TODO: Compare posts to test for actual data modifications, only
                // mark the context as dirty if changes found.
                cx._dirty = true;
                // If the post has an ID (Note: Not a CouchDB doc ID)...
                if( post.id ) {
                    // First, move the id property to a property named $id; this is to
                    // avoid confusion with the CouchDB document ID when saving the post
                    // data;
                    post = merge({ $id: post.id }, post );
                    delete post.id;
                    // ...then filter out any properties whose names begin with _ (WP
                    // sometimes includes them, and couchdb will complain about them).
                    for( var key in post ) {
                        if( key.charCodeAt( 0 ) == 0x5f ) {
                            delete post[key];
                        }
                    }
                    // ...then attempt to read the post from the db...
                    return cx._db.getFeedPost( feedID, post.$id )
                    .then(function( doc ) {
                        // ...if the post is found...
                        if( doc ) {
                            // ...then merge changes over it and save.
                            return cx._db.update( merge( doc, post ) );
                        }
                        else {
                            // ...else create a new post.
                            return cx._db.create( post );
                        }
                    });
                }
                // Post doesn't have an ID, so just insert a new doc into the db.
                // Note that this can result in a plethora of post docs, unless the clean
                // function is used.
                else return cx._db.create( post );
            }
        });
        return q.seqall( updates );
    });
    return this;
}
// Remove obsolete data posts from the feed database.
// @fn: A function for testing whether to keep or discard post data.
//      Returns true if the record is to be kept.
Context.prototype.clean = function( fn ) {
    var cx = this;
    this.add2q(function() {
        // read all feed related posts from db (requires a feedID property)
        return cx._db.getFeedPosts( cx._record.$feedID )
        .then(function( data ) {
            var deletes = data
            .filter(function( post ) {
                return !fn( post );
            })
            .map(function( post ) {
                return {
                    _id:        post._id,
                    _rev:       post._rev,
                    _deleted:   true
                }
            });
            if( deletes.length ) {
                // If there are deletions then mark the context as dirty.
                cx._dirty = true;
                return cx._db.bulkUpdate( deletes );
            }
            return q.Q();
        });
    });
    return this;
}
// Add an op function to the op queue.
Context.prototype.add2q = function( fn ) {
    this._opq.push( fn );
}
// Commit the operations on the op queue.
Context.prototype.commit = function() {
    var cx = this;
    // Commit all operations on an op queue.
    function commit( opq ) {
        opq = opq.map(function( op ) {
            return function() {
                // The operation may itself contain calls to methods which will add new
                // async ops to the ops queue. We want these to appear to execute 'in
                // sequence' - that is, before any other async ops that are defined later
                // in the synchronous procedure - so they can't be added to the end of the
                // master op queue. Instead...
                var _opq = [];              // ... create a new op queue...
                cx._opq = [];               // ... assign to cx so that it's accessible
                return op()                 // within the op function...
                .then(function() {
                    return commit( _opq );  // ... and then commit the ops on the new queue
                });                         // as soon as the operation has completed.

                // Note that this will create a recursive structure of nested op queues;
                // recursion stops once a function generates an empty op queue.
                // Note also that there's no need to restore the context's original op queue
                // once we're done.
            }
        });
        return q.seqall( opq );
    }
    return commit( this._opq );
}
// Create a new feed download context.
// @record:         The feed download record.
// @lastBuildID:    The ID of the most recent build for the feed. Can be null.
// @db:             A db client.
function Context( record, lastBuildID, db ) {
    this._opq = [];
    this._record = record;
    this._lastBuildID = lastBuildID;
    this._db = db;
}

inherits( Post, AsyncData );
// Map post data to a new format.
Post.prototype.map = function( fn ) {
    var post = this;
    this._cx.add2q(function() {
        return q.Q( fn( post._data ) )
        .then(function( data ) {
            post._data = data;
        });
    });
    return this;
}
function Post( cx ) {
    this._cx = cx;
}

inherits( Feed, Post );
// Return the list of posts from feed data.
// Returns a Posts object.
Feed.prototype.posts = function( arg ) {
    // A function for extracting an array of posts from the feed data.
    var fn;
    if( typeof arg == 'function' ) {
        fn = arg;
    }
    else if( typeof arg == 'string' ) {
        var path = arg.split('.');
        // Function will resolve a nested property value on the feed data.
        fn = function( data ) {
            return path.reduce(function( result, name ) {
                return result && result[name];
            }, data );
        }
    }
    else {
        // Function will resolve a property named 'posts' on the feed data.
        fn = function( data ) {
            return data.posts;
        }
    }
    var feed = this;
    var posts = new Posts( this );
    var err = new Error();
    this._cx.add2q(function() {
        return q.Q( fn( feed._data ) )
        .then(function( data ) {
            if( Array.isArray( data ) ) {
                posts._data = data;
            }
            else {
                err.message = 'Posts data must be an array';
                throw err;
            }
        });
    });
    return posts;
}
function Feed( cx, url ) {
    this._cx = cx;
    this._url = url;
}

inherits( Posts, AsyncData );
// Map the array of posts to a new format.
Posts.prototype.map = function( fn ) {
    var posts = this;
    this._cx.add2q(function() {
        posts._data = posts._data.map( fn );
        return q.Q();
    });
    return this;
}
function Posts( feed ) {
    this._cx = feed._cx;
}

exports.newContext = function( record, lastBuildID, db ) {
    return new Context( record, lastBuildID, db );
}
