var Log = require('log4js').getLogger('semo-build.build');
var q = require('semo/lib/q');
var cx = require('./buildcx');
var files = require('./files');
var format = require('util').format;
var spawn = require('child_process').spawn;
var mods = {
    bq:     require('./buildqueue'),
    build:  require('./build'),
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    path:   require('path'),
    utils:  require('./utils'),
    zip:    require('./zip')
}

// Execute a command in the specified working directory.
function exec( cwd, cmd ) {
    var dp = q.defer();
    try {
        cmd = cmd.split(' ');
        var args = cmd.slice( 1 );
        cmd = cmd[0];
        var stdout = [], stderr = [];
        var proc = spawn( cmd, args, { cwd: cwd });
        proc.stdout.on('data', function( data ) {
            stdout.push( data );
        });
        proc.stderr.on('data', function( data ) {
            stderr.push( data );
        });
        proc.on('error', function( e ) {
            dp.reject( e );
        });
        proc.on('close', function() {
            if( stderr.length > 0 ) {
                stderr = Buffer.concat( stderr ).toString();
                dp.reject( stderr );
            }
            else {
                stdout = Buffer.concat( stdout ).toString();
                dp.resolve( stdout );
            }
        });
    }
    catch( e ) {
        Log.error('exec', e );
        dp.reject();
    }
    return dp.promise;
}

Builder.prototype.start = function( config, components ) {
    this.config = config;
    var latency = config.get('build.queueLatency', 60000 );
    Log.debug('Starting build queue with latency %d secs...', latency/1000 );
    this.buildQueue = mods.bq.create( this, components.install, this.db, latency );
    return this.buildQueue.start();
}
Builder.prototype.paths = function( feedID ) {
    return new mods.build.BuildPaths( this.config, false, feedID );
}
Builder.prototype.getLastBuildID = function( feedID ) {
    var cwd = this.paths( feedID ).outputRoot;
    return exec( cwd, 'git log --pretty=format:%h -n 1')
    .fail(function( err ) {
        return 'initial';
    });
}
// Add a build call to the queue.
Builder.prototype.addToBuildQueue = function( feed, opts ) {
    Log.debug('Adding feed %s to build queue...', feed.id );
    return this.buildQueue.addBuildRequest( feed, opts );
}
Builder.prototype.buildFeed = function( feed, opts ) {
    opts = mods.utils.merge( opts, { saveBuild: true });
    var builder = this;
    var build = mods.build.newBuildWithBuilder( this, feed, opts );
    Log.info('[%s] Starting build...', build );
    return q.fcall(function loadBuildData() {
        Log.debug('[%s] Loading build data...', build );
        // Load build data from the db.
        var feedid = build.feed.id;
        return q.all([
            build.db.getFeedRecord( feedid ),
            build.db.getFeedPosts( feedid )
        ])
        .spread(function data( record, posts ) {
            build.data = {
                record: record,
                posts:  posts
            }
        });
    })
    /** TODO: If build dir doesn't exist, then create and git init it.
    .then(function prepareBuildDirectory() {
        var outputPath = build.paths.outputRoot;
        Log.debug('[%s] Preparing build directory at %s...', build, outputPath );
        // Delete & recreate the build output dir.
        return mods.cmds.q.rmdir( outputPath )
        .then(function mkdir() {
            return mods.cmds.q.mkdir( outputPath );
        });
    })
    */
    .then(function getPreviousBuildID() {
        return builder.getLastBuildID( feed.id );
    })
    .then(function execBuildFunction( lastBuildID ) {
        build.prevBuildID = lastBuildID;
        Log.debug('[%s] Executing build function...', build );
        // Execute the feed's build function.
        return cx.exec( build )
        .fail(function err( err ) {
            Log.error('[%s] Error calling build function', build, err );
        });
    })
    .then(function commitBuild() {
        Log.debug('[%s] Commit build result...', build );
        try {
            var cwd = build.paths.outputRoot;
            return exec( cwd, 'git add -A .')
            .then(function() {
                // Message is a hack here - the exec command will split the message around
                // its spaces, regardless of the quotation marks.
                return exec( cwd, 'git commit -m Semo_automated_build');
            })
            .then(function() {
                Log.info('[%s] Build complete', build );
            })
            .fail(function( err ) {
                Log.error('[%s] Unable to commit changes', build, err );
            });
        }
        catch( e ) {
            return q.reject( e );
        }
    });
}
function Builder( db ) {
    this.db = db;
}

exports.create = function( db ) {
    return new Builder( db );
}
