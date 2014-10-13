var Log = require('log4js').getLogger('semo-build.build');
var q = require('semo/lib/q');
var cx = require('./buildcx');
var files = require('./files');
var format = require('util').format;
var mods = {
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    path:   require('path'),
    zip:    require('./zip')
}

// Merge properties from one or more objects into a single object.
// Properties on the left-most object take precedence.
function merge() {
    var result = {};
    for( var i = arguments.length - 1; i > -1; i-- ) {
        var arg = arguments[i];
        for( var id in arg ) {
            result[id] = arg[id];
        }
    }
    return result;
}
BuildPaths.prototype.content = function( buildID ) {
    return this.publishPath('content', buildID );
}
BuildPaths.prototype.contentZip = function( buildID ) {
    return this.publishPath('content.zip', buildID );
}
// Return the path to a build's diff-since-build content zip.
BuildPaths.prototype.sinceZip = function( since, buildID ) {
    return this.publishPath( format('%s-content.zip', since ), buildID);
}
// Return a path resolved against the build's output directory.
BuildPaths.prototype.publishPath = function( path, buildID ) {
    buildID = buildID||this.buildID;
    if( !buildID ) {
        throw new Error('BuildPaths: buildID not available');
    }
    return mods.path.join( this.publishRoot, buildID, path );
}
BuildPaths.prototype.outputPath = function( path ) {
    return mods.path.join( this.outputRoot, path );
}
// Create a new build paths object.
function BuildPaths( config, outPath, feedID ) {
    outPath = outPath||config.get('build.dirs.output','output');
    this.outputRoot = mods.path.resolve( outPath, feedID );
    this.publishRoot = mods.path.join( config.get('build.dirs.publish','publish'), feedID );
}
// Check whether the current build is different from the previous build.
Build.prototype.hasNewContent = function() {
    var curr = this.files;
    var prev = this.prevBuild.files;
    // If no previous build found, then all content is new.
    if( !prev ) {
        return true;
    }
    // Generate a sorted list of filenames for each build.
    var currFiles = Object.keys( curr ).sort();
    var prevFiles = Object.keys( prev ).sort();
    // Iterate over both lists of files. If any filename at any position
    // is different, or if the checksums for any files are different, then
    // the builds are different.
    for( var idx = 0; idx < currFiles.length; idx++ ) {
        var file = currFiles[idx];
        // Compare file names.
        if( file != prevFiles[idx] ) {
            return true;
        }
        // Compare file checksums.
        if( curr[file] != prev[file] ) {
            return true;
        }
    }
    return false;
}
// Create a build record in the db. Assigns the ID of the new couchdb doc to this build.
Build.prototype.createRecord = function() {
    var build = this;
    return this.db.create( this )
    .then(function( doc ) {
        build.id = doc._id;
        build.rev = doc._rev;
        build.paths.buildID = doc._id;
        return build;
    });
}
// Remove the build from the system. Deletes the build record and the build directory.
Build.prototype.remove = function() {
    var build = this;
    return mods.cmds.q.rmdir( build.paths.root )
    .then(function() {
        return build.db.remove( build );
    });
}
// Return a complete list of the all the files contained by this build.
// Files are listed in alphabetical order.
Build.prototype.filelist = function() {
    return Object.keys( this.files ).sort();
}
// Convert the build object to JSON. Used when writing the build document to the db.
Build.prototype.toJSON = function() {
    return {
        _id:    this.id,
        _rev:   this.rev,
        type:   'build-record',
        feedID: this.feed.id,
        time:   this.time,
        files:  this.files
    }
}
// Return string identifier for build.
Build.prototype.toString = function() {
    return format('build/feed %s', this.feed.id );
}
function Build( builder, feed, opts ) {
    this.config = builder.config;
    this.feed = feed;
    this.fn = feed.build;
    this.inPath = feed.inPath;
    this.paths = new BuildPaths( this.config, opts.buildPath, feed.id );
    this.db = builder.db;
    this.time = new Date();
}

Builder.prototype.start = function( config, components ) {
    this.config = config;
}
Builder.prototype.paths = function( feedID ) {
    return new BuildPaths( this.config, false, feedID );
}
Builder.prototype.buildFeed = function( feed, opts ) {
    opts = merge( opts, { saveBuild: true });
    var build = new Build( this, feed, opts );
    return q.fcall(function loadBuildData() {
        Log.debug('[%s] Loading build data...', build );
        // Load build data from the db.
        var feedid = build.feed.id;
        return q.all([
            build.db.getFeedRecord( feedid ),
            build.db.getFeedPosts( feedid )
        ])
        .then(function( results ) {
            build.data = {
                record: results[0],
                posts:  results[1]
            }
        });
    })
    .then(function prepareBuildDirectory() {
        var outputPath = build.paths.outputRoot;
        Log.debug('[%s] Preparing build directory at %s...', build, outputPath );
        // Delete & recreate the build output dir.
        return mods.cmds.q.rmdir( outputPath )
        .then(function() {
            return mods.cmds.q.mkdir( outputPath );
        });
    })
    .then(function execBuildFunction() {
        Log.debug('[%s] Executing build function...', build );
        // Execute the feed's build function.
        return cx.exec( build );
    })
    .then(function genOutputChecksums() {
        Log.debug('[%s] Generating checksums...', build );
        // Calculate the checksums of all files in the output directory, and assign
        // the result to build.files.
        return files.chksums( build.paths.outputRoot )
        .then(function( files ) {
            build.files = files;
        });
    })
    .then(function loadPreviousBuild() {
        Log.debug('[%s] Loading previous build...', build );
        // Find the previous build for the current feed and assign to build.prevBuild.
        return build.db.getFeedBuilds( build.feed.id )
        .then(function( builds ) {
            // The previous build is the first on the list of feed builds.
            build.prevBuild = builds[0];
            // Also save the complete list for use later (see trimOlderBuilds)
            build.prevBuilds = builds;
        });
    })
    .then(function saveBuild() {
        // Test whether this build has new content...
        if( opts.saveBuild && build.hasNewContent() ) {
            // Path to the manifest file in the build result.
            var manifestpath = build.paths.outputpath('manifest.json');
            Log.debug('[%s] Saving new content...', build );
            // ...and if so then save the build document to the database.
            return build.createRecord()
            .then(function readBuildManifest() {
                // Attempt to read manifest data from the build result.
                return q.nfcall( mods.fs.readFile( manifestPath ) )
                .fail(function() {
                    // Assume failure is due to file not found - return empty manifest object instead.
                    return {};
                });
            })
            .then(function writeBuildManifest( manifest ) {
                Log.debug('[%s] Writing build manifest...', build );
                // Merge additional build manifest values over the user-defined manifest.
                manifest = merge( manifest, {
                    id:     build.id,           // The build unique ID.
                    time:   build.time,         // The build time.
                    files:  build.filelist()    // A list of the files in this build.
                });
                var json = JSON.stringify( manifest );
                // write the manifest as json to a file in the build output directory.
                return q.nfcall( mods.fs.writeFile, manifestPath, json );
            })
            .then(function moveOutputDirectory() {
                // Move the build to its permanent position.
                var contentPath = build.paths.content();
                Log.debug('[%s] Moving build to %s...', build, contentPath );
                return mods.cmds.q.mv( build.outputRoot, contentPath );
            })
            .then(function makeZipFile() {
                var zipPath = build.paths.contentZip();
                Log.debug('[%s] Creating zip file at %s...', build, zipPath );
                var contentPath = build.paths.content();
                return mods.zip.zip( zipPath, contentPath );
            })
            /*
            .then(function trimOlderBuilds() {
                // Trim any old builds from the system.
                var maxRetainedBuilds = build.feed.maxRetainedBuilds
                                     ||config.get('build.maxRetainedBuilds', 10 );
                var oldBuilds = build.prevBuilds.slice( maxRetainedBuilds ).reverse();
                Log.debug('[%s] Removing %d obsolete builds...', build, oldBuilds.length );
                return q.seqall( oldBuilds.map(function( build ) {
                    // TODO: Note that the publish dir of any build can be removed immediately
                    // that the new build is generated (i.e. at the same time as the build is
                    // moved above; i.i.e each feed only ever has a single live build publish
                    // dir).
                    // NOTE though that the build documents should be kept and removed in the
                    // manner done here (although, build docs could also be marked as inactive
                    // rather than being actually deleted).
                    return build.remove();
                }));
            })
            */
            .done();
        }
        else Log.debug('[%s] No new content', build );
    })
    .done();
}
function Builder( db ) {
    this.db = db;
}

exports.create = function( db ) {
    return new Builder( db );
}
