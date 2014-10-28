var Log = require('log4js').getLogger('semo-build.build');
var q = require('semo/lib/q');
var cx = require('./buildcx');
var files = require('./files');
var format = require('util').format;
var mods = {
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    path:   require('path'),
    utils:  require('./utils'),
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
    this.metaHandler = config.get('build.metaHandler', {
        hasChanges: function( newMeta, oldMeta ) {
            return false;
        },
        toJSON: function( meta ) {
            return meta;
        }
    });
}
// Check whether the current build is different from the previous build.
Build.prototype.hasNewContent = function() {
    var curr = this.files;
    var prev = this.prevBuild && this.prevBuild.files;
    // If no previous build found, then all content is new.
    if( !prev ) {
        return true;
    }
    // Generate a sorted list of filenames for each build.
    var currFiles = Object.keys( curr ).sort();
    var prevFiles = Object.keys( prev ).sort();
    var fileName, currFile, prevFile;
    // Iterate over both lists of files. If any filename at any position
    // is different, or if the checksums for any files are different, then
    // the builds are different.
    for( var idx = 0; idx < currFiles.length; idx++ ) {
        fileName = currFiles[idx];
        // Compare file names.
        if( fileName != prevFiles[idx] ) {
            return true;
        }
        // Compare file checksums.
        currFile = curr[fileName];
        prevFile = prev[fileName];
        if( currFile.sum != prevFile.sum || currFile.size != prevFile.size ) {
            return true;
        }
    }
    // Check if the meta data has changed.
    if( this.metaHandler.hasChanges( this.meta, prev.meta ) ) {
        return true;
    }
    // No changes found, so return false.
    return false;
}
// Create a build record in the db. Assigns the ID of the new couchdb doc to this build.
Build.prototype.createRecord = function() {
    var build = this;
    return this.db.create( this )
    .then(function( result ) {
        var doc = result[0];
        if( doc ) {
            build.id = doc.id;
            build.rev = doc.rev;
            build.paths.buildID = doc.id;
        }
        else {
            Log.warn('[%s] Build document not created', build );
        }
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
// Convert the build's meta-data to JSON. Used when generating the build manifest.
Build.prototype.metaToJSON = function() {
    return this.metaHandler.toJSON( this.meta );
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
        // Read build meta data.
        var meta = (build.prevBuild && build.prevBuild.meta)||{};
        // Execute the feed's build function.
        return cx.exec( build, meta )
        .then(function( meta ) {
            // Meta data can be a graph containing nested promises; so resolve
            // these before continuing.
            return mods.utils.resolveAllPromises( meta );
        })
        .then(function( meta ) {
            build.meta = meta;
        });
    })
    .then(function genOutputChecksums() {
        Log.debug('[%s] Generating checksums...', build );
        // Calculate the checksums of all files in the output directory, and assign
        // the result to build.files.
        var outputRoot = build.paths.outputRoot;
        return files.chksums( outputRoot )
        .then(function( files ) {
            // Filenames are presented here as absolute paths; convert to relative to output dir.
            build.files = Object.keys( files )
            .reduce(function( result, path ) {
                if( path ) {
                    var rpath = mods.path.relative( outputRoot, path );
                    var file = files[path];
                    result[rpath] = {
                        sum:  file.sum,
                        size: file.size
                    };
                }
                return result;
            }, {});
        });
    })
    .then(function saveBuild() {
        // Path to the manifest file in the build result.
        var manifestPath = build.paths.outputPath('manifest.json');
        // Test whether this build has new content...
        if( opts.saveBuild && build.hasNewContent() ) {
            Log.debug('[%s] Saving new content...', build );
            // ...and if so then save the build document to the database.
            return build.createRecord()
            /* TODO: Remove this - replaced by build.metaToJSON()
            .then(function readBuildManifest() {
                // Attempt to read manifest data from the build result.
                return q.nfcall( mods.fs.readFile, manifestPath )
                .then(function( data ) {
                    return JSON.parse( data.toString() );
                })
                .fail(function() {
                    // Assume failure is due to file not found - return empty manifest object instead.
                    return {};
                });
            })
            .then(function writeBuildManifest( manifest ) {
            */
            .then(function writeBuildManifest() {
                var manifest = build.metaToJSON();
                Log.debug('[%s] Writing build manifest...', build );
                // Merge additional build manifest values over the user-defined manifest.
                manifest = merge( manifest, {
                    buildid:    build.id,           // The build unique ID.
                    feedid:     build.feed.id,
                    time:       build.time,         // The build time.
                    files:      build.filelist()    // A list of the files in this build.
                });
                var json = JSON.stringify( manifest );
                // write the manifest as json to a file in the build output directory.
                return q.nfcall( mods.fs.writeFile, manifestPath, json );
            })
            .then(function moveOutputDirectory() {
                // Move the build to its permanent position.
                var contentPath = build.paths.content();
                Log.debug('[%s] Moving build to %s...', build, contentPath );
                // Use the dirname of the content path - this is because the last path component
                // is the new name of the directory that the build is to be moved to.
                return mods.cmds.q.mkdir( mods.path.dirname( contentPath ) )
                .then(function() {
                    return mods.cmds.q.mv( build.paths.outputRoot, contentPath );
                });
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
        else if( !opts.saveBuild ) {
            // If build save is disabled then still generate a manifest file with the feed ID.
            Log.debug('[%s] Writing build manifest...', build );
            return q.fcall(function() {
                return q.nfcall( mods.fs.readFile, manifestPath )
                .then(function( data ) {
                    return JSON.parse( data.toString() );
                })
                .fail(function( err ) {
                    // Assume failure is due to file not found - return empty manifest object instead.
                    return {};
                });
            })
            .then(function( manifest ) {
                // Merge additional build manifest values over the user-defined manifest.
                manifest = merge( manifest, {
                    feedid:     build.feed.id,
                    time:       build.time,         // The build time.
                    files:      build.filelist()    // A list of the files in this build.
                });
                var json = JSON.stringify( manifest, null, 4 );
                // write the manifest as json to a file in the build output directory.
                return q.nfcall( mods.fs.writeFile, manifestPath, json );
            })
            .fail(function( err ) {
                Log.error('[%s] Writing build manifest', err );
            })
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
