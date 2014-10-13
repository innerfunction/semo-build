var Log = require('log4js').getLogger('semo-build.download');
var cx = require('./feedcx');

// Start the feed downloader. Ensures that required CDB views are up-to-date.
Downloader.prototype.start = function( config, components ) {}

// Perform a download of the specified feed.
Downloader.prototype.downloadFeed = function( feed ) {
    Log.debug('Starting download of feed %s...', feed.id );
    var db = this.db;
    return db
    .getFeedRecord( feed.id )
    .then(function( record ) {
        Log.debug('Creating download context for feed %s...', feed.id );
        var _cx = cx.newContext( record, db );
        Log.debug('Running download script for feed %s...', feed.id );
        feed.download( _cx );
        Log.debug('Commiting download ops for feed %s...', feed.id );
        return _cx.commit();
    })
    .then(function( dirty ) {
        if( feed.job ) {
            Log.debug('Feed %s download complete, next download scheduled at %s', feed.id, feed.job.nextInvocation());
        }
        return q.Q( dirty );
    });
}
function Downloader( db ) {
    this.db = db;
}
exports.create = function( db ) {
    return new Downloader( db );
}
