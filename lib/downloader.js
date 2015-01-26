var Log = require('log4js').getLogger('semo-build.download');
var cx = require('./feedcx');
var q = require('semo/lib/q');

// Start the feed downloader. Ensures that required CDB views are up-to-date.
Downloader.prototype.start = function( config, components ) {}

// Perform a download of the specified feed.
// @param feed  The feed to download.
// @param url   An optional post URL to download (used for incremental builds).
Downloader.prototype.downloadFeed = function( feed, url ) {
    Log.info('Starting download of feed %s (URL: %s)...', feed.id, url||'none' );
    var db = this.db;
    return q.all([ db.getFeedRecord( feed.id ), db.getMostRecentFeedBuild( feed.id ) ])
    .spread(function( record, lastBuild ) {
        Log.debug('Creating download context for feed %s...', feed.id );
        var _cx = cx.newContext( record, lastBuild, db );
        Log.debug('Running download script for feed %s...', feed.id );
        feed.download( _cx, url );
        Log.debug('Commiting download ops for feed %s...', feed.id );
        return _cx.commit();
    })
    .then(function( dirty ) {
        if( feed.job ) {
            Log.info('Feed %s download complete, next download scheduled at %s', feed.id, feed.job.nextInvocation());
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
