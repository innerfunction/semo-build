var Log = require('log4js').getLogger('semo-build.download');
var cdbutils = require('../cdb-utils');
var db = require('./db');
var cx = require('./cx');

// Start the feed downloader. Ensures that required CDB views are up-to-date.
FeedDownloader.prototype.start = function( config, components ) {
    this.config = config;
    return cdbutils.refreshDesignDoc( config, 'semo-build-download', db.CDBViews );
}
// Perform a download of the specified feed.
FeedDownloader.prototype.downloadFeed = function( feed ) {
    Log.debug('Starting download of feed %s...', feed.id );
    return db
    .createScope( this.config, feed.id )
    .then(function( scope ) {
        Log.debug('Creating download context for feed %s...', feed.id );
        var _cx = cx.newContext( scope.record, scope.db );
        Log.debug('Running download script for feed %s...', feed.id );
        feed.download( _cx );
        Log.debug('Commiting download ops for feed %s...', feed.id );
        return _cx.commit();
    });
}
function FeedDownloader() {}
exports.create = function() {
    return new FeedDownloader();
}
