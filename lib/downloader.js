var Log = require('log4js').getLogger('semo-build.download');
var cx = require('./feedcx');
var q = require('semo/lib/q');

// Start the feed downloader. Ensures that required CDB views are up-to-date.
Downloader.prototype.start = function( config, components ) {
    // A map of feed download queues, keyed by feed ID.
    // Each feed can have only one download in process at any time.
    this.feedQueues = {};
}

// Perform a download of the specified feed.
// @param feed  The feed to download.
// @param url   An optional post URL to download (used for incremental builds).
Downloader.prototype.downloadFeed = function( feed, url ) {
    var dp = q.defer();
    var item = {
        feed:   feed,
        url:    url,
        dp:     dp
    };
    // Find the queue for the specified feed.
    var queue = this.feedQueues[feed.id];
    if( queue ) {
        // If queue is found then add item to its end.
        queue.push( item );
        Log.debug('%d download(s) queued for feed %s', queue.length, feed.id );
    }
    else {
        // Else create a new queue containing the item.
        this.feedQueues[feed.id] = [ item ];
    }
    // Process the queue.
    this.processQueue( feed.id );
    // Return a deferred promise - this will be resolved when the queue item has downloaded.
    return dp.promise;
}
// Process the download queue for a specific feed.
Downloader.prototype.processQueue = function( feedID ) {
    var downloader = this;
    var queue = this.feedQueues[feedID];
    // Take the first item from the head of the feed queue.
    var item = (queue && queue.shift());
    // Process the queue item, if any.
    if( item ) {
        var feed = item.feed;
        var url = item.url;
        var dp = item.dp;
        Log.info('Starting download of feed %s (URL: %s)...', feed.id, url||'none' );
        var db = this.db;
        try {
            // Get the feed record and most recent build record.
            q.all([ db.getFeedRecord( feed.id ), db.getMostRecentFeedBuild( feed.id ) ])
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
                    Log.info('Feed %s download complete, next download scheduled at %s',
                        feed.id, feed.job.nextInvocation());
                }
                // Resolve the queue item's deferred promise.
                dp.resolve( dirty );
                // Process next queue item for the current feed.
                downloader.processQueue( feedID );
            })
            .done();
        }
        catch( e ) {
            dp.reject( e );
        }
    }
}
function Downloader( db ) {
    this.db = db;
}
exports.create = function( db ) {
    return new Downloader( db );
}
