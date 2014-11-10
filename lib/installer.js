var Log = require('log4js').getLogger('semo-build.install');
var q = require('semo/lib/q');
var hotrequire = require('./hotrequire');
var scheduler = require('node-schedule');
var path = require('path');
var format = require('util').format;

// An object representing a data feed.
// TODO: Some kind of validation of the feed def.
function Feed( id, def ) {
    this.id = id;                   // The feed ID.
    this.active = def.active;       // Flag indicating whether the feed is active.
    this.schedule = def.schedule;   // The feed download schedule.
    this.download = def.download;   // The feed download function.
    this.build = def.build;         // The feed build function.
    this.inPath = def.inPath;       // The feed build resource input directory.
    this.exts = def.exts||{};       // Per-feed build extensions.
}

// Start the feed installer.
Installer.prototype.start = function( config, components ) {
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
Installer.prototype.resetFeeds = function() {
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
Installer.prototype.loadFeeds = function( feedModule ) {
    Log.debug('Loading feeds from module...');
    var feeds = feedModule.feeds;
    if( !feeds ) {
        Log.warn('No feeds found in feed module!');
    }
    else for( var id in feeds ) {
        Log.info('Loading feed %s...', id );
        // Create a new feed object from its definition.
        var feed = new Feed( id, feeds[id] );
        // Schedule feed processing if feed is active.
        if( feed.active ) {
            if( feed.schedule ) {
                var schedule;
                if( typeof( feed.schedule ) == 'function' ) {
                    // If feed provides a schedule function then invoke passing a ref
                    // to the node-schedule module.
                    schedule = feed.schedule( scheduler );
                }
                else {
                    schedule = feed.schedule;
                }
                try {
                    Log.debug('Scheduling feed %s...', id );
                    var fn = this.makeFeedProcessFn( feed );
                    feed.job = scheduler.scheduleJob( schedule, fn );
                    Log.debug('Feed %s scheduled, next download at %s', id, feed.job.nextInvocation());
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
Installer.prototype.makeFeedProcessFn = function( feed ) {
    var downloader = this.components.download;
    var builder = this.components.build;
    return function processFeed() {
        // Perform a feed download, followed by a feed build.
        downloader.downloadFeed( feed )
        .then(function build( dirty ) {
            // 'dirty' is a flag indicating whether the feed actually downloaded any new data.
            if( dirty ) {
                return builder.buildFeed( feed );
            }
            else {
                Log.info('Feed %s download context is clean, skipping build...', feed.id );
                return q.Q();
            }
        })
        .then(function done() {
            Log.debug('Processed feed %s', feed.id );
        })
        .fail(function( e ) {
            Log.error('Processing feed %s', feed.id, e );
        });
    }
}

function Installer( db ) {
    this.db = db;
}

// Create a feed installer.
exports.create = function( db ) {
    return new Installer( db );
}

// Load a specific feed from the named feed module.
// Used by the command line build tool.
exports.loadFeed = function( moduleName, feedID ) {
    var feedModule;
    try {
        feedModule = require( moduleName );
    }
    catch( e ) {
        if( e.code == 'MODULE_NOT_FOUND' && !moduleName.indexOf('./') == 0 ) {
            // Module not found; try force loading from file system by resolving to
            // an absolute path.
            var modulePath = path.resolve( moduleName );
            feedModule = require( modulePath );
        }
    }
    var feedDef;
    if( feedModule.feeds ) {
        if( !feedID ) {
            throw new Error('No feed ID specified');
        }
        Log.info('Loading feed %s from multi-feed module', feedID);
        feedDef = feedModule.feeds[feedID];
        if( !feedDef ) {
            throw new Error( format('Feed %s not found in module %s', feedID, moduleName ));
        }
    }
    else if( typeof feedModule.download == 'function' && typeof feedModule.build == 'function' ) {
        // Module looks like a single-feed module.
        feedDef = feedModule;
        if( !feedID ) {
            feedID = path.basename( moduleName ).replace('.js','');
            if( feedID == 'index' ) {
                feedID = path.basename( path.dirname( moduleName ) );
            }
        }
        Log.info('Loading feed %s from single-feed module', feedID);
    }
    return new Feed( feedID, feedDef );
}
