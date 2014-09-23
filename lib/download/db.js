/* Database related functionality for feed downloads.
 */
var Log = require('log4js').getLogger('semo-build.download.db');
var q = require('semo/lib/q');

// CouchDB views used by the build functions.
exports.CDBViews = {
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
    }
}

// Make the download script's db client.
// Returns a thin wrapper around the default semo db client; the wrapper hides some
// of the request details, and returns q promises.
function makeDBClient( config ) {
    var db = config.get('components.dao').db;
    return {
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
            return q.nfcall( db.update, { docs: docs });
        },
        // Query a CouchDB view document. Documents are included in the response.
        view: function( docid, viewid, key ) {
            key = JSON.stringify( key );
            return q.nfcall( db.view, docid, viewid, { key: key, include_docs: 'true' })
            .then(function( args ) {
                return args[0];
            });
        }
    }
}


// Get the download record the specified feed ID.
// Returns the existing record if found, otherwise creates a new record.
function getFeedRecord( db, feedID ) {
    return db.view('semo-build','feed-record', feedID )
    .then(function( data ) {
        if( data.total_rows > 0 ) {
            return data.rows[0].doc;
        }
        else return db.create({
            $feedID: feedID,
            $feedRecord: true
        });
    });
}

// Create a data scope for a feed download function.
// @config:     A Semo configuration (settings) object.
// @feed:       A feed object (see semo-build/install/index.js)
// Returns an object with the following properties:
//  - record:   The feed download record.
//  - db:       A download DB client.
exports.createScope = function( config, feed ) {
    var db = makeDBClient( config );
    return getFeedRecord( db, feed.id )
    .then(function( record ) {
        return {
            record: record,
            db:     db
        }
    });
}
