var Log = require('log4js').getLogger('semo-build/install');
var q = require('semo/lib/q');
var hotrequire = require('./hotrequire');
var scheduler = require('node-schedule');

// Start the feed installer.
FeedInstaller.prototype.start = function( config, components ) {
    Log.debug('Starting feed installer...');
    var installer = this;
    // References to other build system components.
    installer.components = components;
    // Read the feed module name from the config.
    var feedModuleName = config.get('build.install.feedModuleName','semo-build-feeds');
    Log.info('Loading feed definitions from "%s"...', feedModuleName );
    // Load the feed module. The module will be automatically re-loaded if modified.
    hotrequire( feedModuleName )
    .on('load', function( feedModule ) {
        // Feed module loaded.
        installer.resetFeeds();
        installer.loadFeeds( feedModule );
    })
    .on('error', function( err ) {
        Log.error('Loading feed module', err );
    });
}
// Reset any previously loaded feeds.
FeedInstaller.prototype.resetFeeds = function() {
    Log.debug('Resetting feeds...');
    var feeds = this.feeds;
    // Cancel any scheduled jobs for all feeds.
    Log.debug('Cancelling scheduled jobs...');
    for( var id in feeds ) {
        var feed = feeds[id];
        if( feed.job ) {
            Log.debug('\tcancelling %s...', id );
            feed.job.cancel();
        }
    }
    this.feeds = {};
}
// Load new or updated feed definitions from the feed module.
FeedInstaller.prototype.loadFeeds = function( feedModule ) {
    Log.debug('Loading feeds from module...');
    var feeds = feedModule.feeds;
    if( !feeds ) {
        Log.warn('No feeds found in feed module!');
    }
    else for( var id in feeds ) {
        // Copy feed settings from definition.
        var feedDef = feeds[id];
        var feed = {
            id:         id,
            active:     feedDef.active,
            schedule:   feedDef.schedule,
            download:   feedDef.download,
            build:      feedDef.build
        }
        // Schedule feed processing if feed is active.
        if( feed.active ) {
            if( feed.schedule ) {
                try {
                    var fn = this.makeFeedProcessFn( feed );
                    feed.job = scheduler.scheduleJob( feed.schedule, fn );
                }
                catch( e ) {
                    Log.error('Scheduling feed %s', id, e );
                }
            }
            else Log.warn("Can't schedule feed %s, no schedule provided!", id );
        }
        // Assign feed to list of feeds.
        this.feeds[id] = feed;
    }
}
// Return a function for processing (doing download + build) of a feed.
FeedInstaller.prototype.makeFeedProcessFn = function( feed ) {
    var downloader = this.components.download;
    var builder = this.components.build;
    return function processFeed() {
        // Perform a feed download, followed by a feed build.
        downloader.downloadFeed( feed )
        .then(function build() {
            // TODO: Is a mechanism needed here to allow incremental downloads to cancel
            // the build, if no new data (i.e. on the previous download) is present?
            return builder.buildFeed( feed );
        })
        .then(function done() {
            Log.debug('Processed feed %s', feed.id );
        })
        .fail(function( e ) {
            Log.error('Processing feed %s', feed.id, e );
        });
    }
}

function FeedInstaller() {}

exports.create = function() {
    return new FeedInstaller();
}
