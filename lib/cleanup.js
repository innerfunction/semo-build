var Log = require('log4js').getLogger('semo-build.cleanup');
var q = require('semo/lib/q');
var assert = require('assert');
var format = require('util').format;
var mods = {
    path: require('path'),
    cmds: require('semo/build/commands').q
}

/**
 * Cleanup old builds.
 * @param db            The database client.
 * @param feed          The ID of the feed to cleanup; or an array of feed IDs to cleanup.
 *                      If false equivalent then cleans all feeds.
 * @param keep          The number of builds to keep. If false equivalent then removes all builds.
 * @param pclean        Flag indicating whether to delete all data posts associated with each feed.
 * @param publishPath   The path builds are published to. If provided, then removed builds are also
 *                      deleted from the file system.
 * @param pretend       If true then only pretend to do clean up.
 */
function cleanup( db, feed, keep, pclean, publishPath, pretend ) {
    assert( db, 'DB not provided');
    assert( keep >= 0, 'keep must be zero or positive');
    keep = keep||0;
    if( !publishPath ) {
        Log.info('No publish path specified, performing db clean only');
    }
    Log.info( format('Keeping %d build(s); pretend is %s', keep, pretend ? 'on' : 'off'));
    // Resolve a list of feed IDs to process...
    return q.fcall(function resolveFeedIDs() {
        if( !feed ) {
            // Read all feed IDs
            Log.info('Reading feed IDs from database...');
            return db.getUniqueBuildFeedIDs();
        }
        else if( Array.isArray( feed ) ) {
            return feed;
        }
        return [ feed ];
    })
    // ...then cleanup each feed on the list.
    .then(function cleanFeeds( feeds ) {
        Log.info('Cleaning up %d feed(s)...', feeds.length );
        var ops = feeds.map(function makeCleanOp( feedid ) {
            return function cleanOp() {
                Log.debug('Cleaning builds for feed %s...', feedid );
                return db.getFeedBuilds( feedid )
                .then(function deleteBuildsFromDB( builds ) {
                    Log.debug('Found %d build(s) for feed %s...', builds.length, feedid );
                    // Builds are returned in descending chronological order.
                    // Slice the array using the 'keep' arg to yield a list of builds to remove.
                    builds = builds.slice( keep );
                    Log.debug('Cleaning up %d build(s) for feed %s...', builds.length, feedid );
                    // Transform builds array to format used for the bulk delete.
                    var removes = builds.map(function formatBuildDelete( build ) {
                        return {
                            _id:        build._id,
                            _rev:       build._rev,
                            _deleted:   true
                        }
                    });
                    // Update the database (unless we're pretending).
                    (pretend ? q.Q( true ) : db.bulkUpdate( removes ))
                    .then(function() {
                        // If a publish path has been specified...
                        if( publishPath ) {
                            // ...then delete the build files from the file system.
                            var feedPath = mods.path.join( publishPath, feedid );
                            Log.debug('Deleting build files from %s...', feedPath );
                            // Generate delete commands for each build directory.
                            var deletes = builds.map(function makeDeleteOps( build ) {
                                return function deleteOp() {
                                    var buildPath = mods.path.join( feedPath, build._id );
                                    Log.debug('Deleting %s...', buildPath );
                                    if( pretend ) {
                                        return q.Q( true );
                                    }
                                    else return mods.cmds.rmdir( buildPath );
                                }
                            });
                            return q.seqall( deletes );
                        }
                    });
                })
                .then(function postsClean() {
                    if( pclean ) {
                        return db.getFeedPosts( feedid )
                        .then(function deletePostsFromDB( posts ) {
                            Log.debug('Cleaning up %d post(s) for feed %s...', posts.length, feedid );
                            var removes = posts.map(function formatPostDelete( post ) {
                                return {
                                    _id:        post._id,
                                    _rev:       post._rev,
                                    _deleted:   true
                                }
                            });
                            return (pretend ? q.Q( true ) : db.bulkUpdate( removes ));
                        });
                    }
                    else return q.Q( true );
                });
            };
        });
        return q.seqall( ops );
    })
}

exports.process = cleanup;

exports.cli = function() {
    var feed;
    var pretend = false;
    var keep = 10;
    var fsclean = true;
    var pclean = false;
    var clean = false;
    var mode = false;
    if( process.argv.length < 3 ) {
        console.log();
        console.log('cleanup [-clean] [-feed <feedid>] [-keep <count>] [-nofsclean] [-pclean] [-pretend]');
        console.log('Cleanup build records in the database and build results on the file system')
        console.log();
        console.log('  -clean       Perform a cleanup. Necessary to perform a clean if no other switches are used');
        console.log('  -feed        Specify a feed ID to process');
        console.log('  -keep        Set the number of build records to keep. Defaults to 10');
        console.log('  -nofsclean   Don\'t remove build results from the file system');
        console.log('  -pclean      Remove all data posts associated with the feed. Defaults to false');
        console.log('  -pretend     Only pretend to do a cleanup - don\'t actually remove anything');
        console.log();
        process.exit( 0 );
    }
    process.argv.slice( 2 ).forEach(function( arg ) {
        switch( arg ) {
        case '-clean':
            clean = true;
            break;
        case '-feed':
            mode = arg;
            clean = true;
            break;
        case '-keep':
            mode = arg;
            clean = true;
            break;
        case '-nofsclean':
            fsclean = false;
            clean = true;
            break;
        case '-pclean':
            pclean = true;
            clean = true;
            break;
        case '-pretend':
            pretend = true;
            clean = true;
            break;
        default:
            switch( mode ) {
            case '-keep':
                keep = Number( arg );
                break;
            case '-feed':
                feed = arg;
                break;
            case false:
            default:
                console.log('Unknown switch:',arg);
                process.exit( 1 );
            }
            mode = false;
        }
    });
    if( clean ) {
        var start = require('./start');
        start({})
        .then(function( components ) {
            var publishPath = components.config.get('build.dirs.publish','publish');
            return cleanup( components.db, feed, keep, pclean, publishPath, pretend );
        })
        .then(function() {
            console.log('Done');
        })
        .fail(function( err ) {
            console.log( err );
        })
        .done();
    }
    else {
        console.log('Nothing done; use -clean to perform a cleanup');
    }
}
