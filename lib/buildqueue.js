var Log = require('log4js').getLogger('buildqueue');
var deepeq = require('./utils').deepeq;

/**
 * A data structure for queuing feed builds.
 * Has a built in latency which allows multiple build requests for the same feed to
 * be aggregated into a single build operation. This works as follows:
 * - An initial build request is added to the queue with a 'time' property that specifies
 *   the earliest time that the build should occur at. The 'time' property is calculated
 *   as the current time plus the latency value.
 * - If any subsequent requests to build the same feed are received before the build time
 *   then the build request is moved to the end of the queue, and its 'time' property is
 *   reset.
 * - Once no more build requests for a given feed are received then the build time will
 *   finally elapse and the build will take place.
 * @param builder   The builder component.
 * @param installer The installer component.
 * @param db        A DB client.
 * @param latency   The size of the build latency window in ms.
 */
function BuildQueue( builder, installer, db, latency ) {
    this.queue = [];            // The queue of build requests.
    this.builder = builder;
    this.installer = installer;
    this.db = db;
    this.latency = latency;
}
/**
 * Start the queue. Attempts to load the persisted queue from the database store.
 * @return A deferred promise, resolved once the queue is ready.
 */
BuildQueue.prototype.start = function() {
    var bq = this;
    return this.db.loadBuildQueue( bq )
    .then(function initializeBuildQueue() {
        Log.debug('Loaded %d items on build queue, initializing...', bq.queue.length );
        var feeds = bq.installer.feeds;
        // Populate the queue item with the full feed object.
        bq.queue.forEach(function each( item ) {
            item.feed = feeds[item.feed];
        });
        // Remove any queue items where the feed object can't be resolved.
        bq.queue = bq.queue.filter(function filter( item ) {
            return !!item.feed;
        });
        Log.debug('Build queue initialized (length=%d)', bq.queue.length );
        // Process the newly loaded queue.
        bq.process();
    });
}
/**
 * Add a build request for a specified feed to the queue.
 * Resets any previous request for the same feed still on the queue to the end of the queue.
 * @param feed  The feed to build.
 * @param opts  Build options. These are included when checking for matching queued build
 *              requests.
 * @return A deferred promise which resolves once the build request is added to the queue,
 * and the queue has been peristed.
 */
BuildQueue.prototype.addBuildRequest = function( feed, opts ) {
    var bq = this;
    var queue = this.queue;
    // Check the queue for a matching request.
    for( var i = 0; i < queue.length; i++ ) {
        var item = queue[i];
        if( item.feed.id == feed.id && deepeq( item.opts, opts ) && !item.building ) {
            // If a matching request is found and isn't building then remove from the queue
            // and stop looking for a match.
            queue.splice( i, 1 );
            break;
        }
    }
    // Add a new build request to the end of the queue. Note that if a matching request was
    // found on the queue then it is being replaced with this item.
    queue.push({
        feed:   feed,
        opts:   opts,
        time:   Date.now() + bq.latency, // The soonest build time.
        toJSON: function() {
            return {
                feed: this.feed.id,
                opts: this.opts,
                time: this.time
            }
        }
    });
    return bq.saveAndProcess();
}
/**
 * Persist the build queue and schedule a process to check its head.
 * @return A deferred promise, resolved once the queue has saved.
 */
BuildQueue.prototype.saveAndProcess = function() {
    var bq = this;
    return bq.db.saveBuildQueue( bq )
    .then(function next() {
        // Schedule a queue process.
        process.nextTick(function process() {
            bq.process();
        });
    });
}
/**
 * Process the build queue. Will execute the first build request on the queue, if its soonest
 * build time has elapsed; otherwise waits for the soonest build time of the first item.
 */
BuildQueue.prototype.process = function() {
    Log.debug('Processing queue (length=%d)', this.queue.length );
    var bq = this;
    var head = this.queue[0];
    // If a head item is found and it's not building then attempt to process it,
    // or schedule it for processing later.
    if( head && !head.building ) {
        // Check the first build request's soonest build time.
        var now = Date.now();
        if( head.time <= now ) {
            // Build time has elapsed, build the item.
            bq.buildHeadItem();
        }
        else if( !bq.timer ) {
            // If no timer set then set a new timer to run when the first item is due.
            bq.timer = setTimeout(function timer() {
                bq.timer = false;
                bq.process();
            }, head.time - now );
        }
    }
}
/**
 * Build the head item on the queue.
 */
BuildQueue.prototype.buildHeadItem = function() {
    var bq = this;
    var head = this.queue[0];
    // Set a flag to indicate that this item is building. This flag is important as if
    // a new build request for the feed being built is received then it has to be
    // scheduled as a separate request and not piggy-backed on the request being built.
    // See addBuildRequest() above.
    head.building = true;
    // Pass the build request to the builder.
    bq.builder.buildFeed( head.feed, head.opts )
    .then(function nextItem() {
        // Remove the item from the build queue, save the queue and continue processing.
        bq.queue.shift();
        return bq.saveAndProcess();
    })
    .fail(function error( err ) {
        Log.error('Building %s...', feed.id, err );
        // Remove the item from the build queue, save the queue and continue processing.
        bq.queue.shift();
        return bq.saveAndProcess();
    });
}

exports.create = function( builder, installer, db, latency ) {
    return new BuildQueue( builder, installer, db, latency );
}
