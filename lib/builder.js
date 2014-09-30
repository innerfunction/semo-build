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
        return build;
    });
}
// Return the full path to the build's permanent location on the file-system.
// @dir:    An optional sub-path under the build's main directory.
Build.prototype.path = function( dir ) {
    // Get the root path. Defaults to /publish under the current working directory.
    var rootPath = this.config.get('build.dirs.publish','publish');
    return mods.path.resolve( rootPath, this.id, dir );
}
// Remove the build from the system. Deletes the build record and the build directory.
Build.prototype.remove = function() {
    var build = this;
    return mods.cmds.q.rmdir( build.path() )
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
function Build( builder, feed ) {
    this.config = builder.config;
    this.feed = feed;
    this.fn = feed.build;
    this.inPath = feed.inPath;
    var buildPath = builder.config.get('build.path');
    this.outPath = mods.path.resolve( buildPath, feed.id );
    this.db = builder.db;
    this.time = new Date();
}

Builder.prototype.start = function( config, components ) {
    this.config = config;
}
Builder.prototype.buildFeed = function( feed ) {
    var build = new Build( this, feed );
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
            return build;
        });
    })
    .then(function prepareBuildDirectory( build ) {
        Log.debug('[%s] Preparing build directory at %s...', build, build.outPath );
        // Delete & recreate the build output dir.
        mods.cmds.q.rmdir( build.outPath )
        .then(function() {
            return mods.cmds.q.mkdir( build.outPath );
        })
        .then(function() {
            return build;
        });
    })
    .then(function execBuildFunction( build ) {
        Log.debug('[%s] Executing build function...', build );
        // Execute the feed's build function.
        return cx.exec( build );
    })
    .then(function genOutputChecksums( build ) {
        Log.debug('[%s] Generating checksums...', build );
        // Calculate the checksums of all files in the output directory, and assign
        // the result to build.files.
        return files.chksums( build.outPath )
        .then(function( files ) {
            build.files = files;
            return build;
        });
    })
    .then(function loadPreviousBuild( build ) {
        Log.debug('[%s] Loading previous build...', build );
        // Find the previous build for the current feed and assign to build.prevBuild.
        return build.db.view('semo-build','builds', build.feed.id )
        .then(function( data ) {
            // The previous build is the first on the list of feed builds.
            build.prevBuild = data.total_rows > 0 && data.rows[0].doc;
            // Also save the complete list for use later (see trimOlderBuilds)
            build.prevBuilds = data.rows.map(function( row ) {
                return row.doc;
            });
            return build;
        });
    })
    .then(function saveIfBuildHasNewContent( build ) {
        // Test whether this build has new content...
        if( build.hasNewContent() ) {
            Log.debug('[%s] Saving new content...', build );
            // ...and if so then save the build document to the database.
            return build.createRecord()
            .then(function createBuildManifest() {
                Log.debug('[%s] Writing build manifest...', build );
                // The build manifest contents.
                var manifest = {
                    id:     build.id,           // The build unique ID.
                    time:   build.time,         // The build time.
                    files:  build.filelist()    // A list of the files in this build.
                }
                // Write the manifest as JSON to a file in the build output directory.
                var path = mods.path.join( build.outPath, 'manifest.json');
                var json = JSON.stringify( manifest );
                return q.nfcall( mods.fs.writeFile, path, json );
            })
            .then(function moveOutputDirectory() {
                // Move the build to its permanent position.
                var path = build.path('content');
                Log.debug('[%s] Moving build to %s...', build, path );
                return mods.cmds.q.mv( build.outPath, path );
            })
            .then(function makeZipFile() {
                var zipPath = build.path('content.zip');
                Log.debug('[%s] Creating zip file at %s...', build, zipPath );
                var contentPath = build.path('content');
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
