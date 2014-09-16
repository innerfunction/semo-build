var q = require('semo/lib/q');
var start = require('semo/core/start');

function makeDBClient( config ) {
    var db = config.get('components.dao').db;
    return {
        get: function( id ) {
            return q.nfcall( db.get, id );
        },
        update: function( id, doc ) {
            return q.nfcall( db.update, id, doc );
        },
        bulkUpdate: function( docs ) {
            return q.nfcall( db.update, { docs: docs });
        },
        view: function( docid, viewid, key ) {
            return q.nfcall( db.view, docid, viewid, key );
        }
    }
}

function getRecordForFeed( db, feedID ) {
}

exports.download = function( feedID, fn ) {
    var dp = q.defer();
    start.startWithComponents(['dao'], function( ok, config ) {
        var db = makeDBClient( config );
        var ps = getRecordForFeed( db, feedID )
        .then(function( record ) {
            var cx = require('./cx').newContext( record, db );
            fn( cx );
            return cx.commit();
        });
        dp.resolve( ps );
    });
    return dp.promise;
}
