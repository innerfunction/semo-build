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
 * @param db        A DB client.
 * @param latency   The size of the build latency window in ms.
 */
function BuildQueue( builder, db, latency ) {
    this.queue = [];            // The queue of build requests.
    this.builder = builder;
    this.latency = latency;
}
/**
 * Start the queue. Attempts to load the persisted queue from the database store.
 * @return A deferred promise, resolved once the queue is ready.
 */
BuildQueue.prototype.start = function() {
    return this.db.loadBuildQueue( this );
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
        if( item.feed.id == feed.id && deepeq( item.opts, opts ) ) {
            // If a matching request is found then remove from the queue stop looking for
            // a match.
            queue.splice( i, 1 );
            break;
        }
    }
    // Add a new build request to the end of the queue. Note that if a matching request was
    // found on the queue then it is being replaced with this item.
    queue.push({
        feed:   feed,
        opts:   opts,
        time:   Date.now() + latency    // The soonest build time.
    });
    return bd.saveAndProcess();
}
/**
 * Persist the build queue and schedule a process to check its head.
 * @return A deferred promise, resolved once the queue has saved.
 */
BuildQueue.prototype.saveAndProcess = function() {
    return bq.db.saveBuildQueue( bq )
    .then(function() {
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
    var bq = this;
    var head = this.queue[0];
    if( head ) {
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
    // Pass the build request to the builder.
    bq.builder.buildFeed( head.feed, head.opts )
    .then(function nextItem() {
        // Remove the item from the build queue, save the queue and continue processing.
        bq.queue.shift();
        return bq.saveAndProcess();
    });
}
