var Log = require('log4js').getLogger('semo-build.build');
var q = require('semo/lib/q');
var cx = require('./cx');
var files = require('./files');
var format = require('util').format;
var mods = {
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    path:   require('path')
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
// Save the build document to the db. Creates a new couchdb document and assigns
// its ID to this build.
Build.prototype.save = function() {
    var build = this;
    return this.db.create( this )
    .then(function( doc ) {
        build.id = doc._id;
        build.rev = doc._rev;
        return build;
    });
}
// Convert the build object to JSON. Used when writing the build document to the db.
Build.prototype.toJSON = function() {
    return {
        _id:    this.id,
        _rev:   this.rev,
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
    this.inPath = ;// TODO
    this.outPath = ;// TODO
    this.time = new Date();
}

FeedBuilder.prototype.start = function( config, components ) {
    this.config = config;
}
FeedBuilder.prototype.buildFeed = function( feed ) {
    var build = new Build( this, feed );
    return q.fcall(function loadBuildData() {
        Log.debug('[%s] Loading build data...' build );
        // Load build data from the db.
        var build = this;
        var feedid = this.feed.id;
        // TODO: Need to setup .db property; review view names.
        return q.all([
            this.db.view('semo-build-feed','feed-record', feedid ),
            this.db.view('semo-build-feed','feed-post', feedid )
        ])
        .then(function( results ) {
            build.data = {
                record: results[0],
                posts:  results[1]
            }
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
            build.prevBuild = data.total_rows > 0 && data.rows[0].doc;
            return build;
        });
    })
    .then(function saveIfBuildHasNewContent( build ) {
        // Test whether this build has new content...
        if( build.hasNewContent() ) {
            Log.debug('[%s] Saving new content...', build );
            // ...and if so then save the build document to the database.
            return build.save()
            .then(function createBuildManifest() {
                Log.debug('[%s] Writing build manifest...', build );
                // The build manifest contents.
                var manifest = {
                    id:     build.id,           // The build unique ID.
                    time:   build.time,         // The build time.
                    files:  build.listFiles()   // A list of the files in this build.
                }
                // Write the manifest as JSON to a file in the build output directory.
                var path = mods.path.join( build.outPath, 'manifest.json');
                var json = JSON.stringify( manifest );
                return q.nfcall( mods.fs.writeFile, path, json );
            })
            .then(function moveOutputDirectory() {
                // Move the build to its permanent position.
                var path = build.path();
                Log.debug('[%s] Moving build to %s...', build, path );
                return mods.cmds.q.mv( build.outPath, path );
            })
            .then(function trimOldBuilds() {
                // Trim any old builds from the system.
                // TODO:
            })
            .done();
        }
        else Log.debug('[%s] No new content', build );
    })
    .done();
}
function FeedBuilder() {}

exports.create = function() {
    return new FeedBuilder();
}
