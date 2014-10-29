var Log = require('log4js').getLogger('semo-build.build');
var q = require('semo/lib/q');
var cx = require('./buildcx');
var files = require('./files');
var format = require('util').format;
var mods = {
    build:  require('./build'),
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    path:   require('path'),
    utils:  require('./utils'),
    zip:    require('./zip')
}

Builder.prototype.start = function( config, components ) {
    this.config = config;
}
Builder.prototype.paths = function( feedID ) {
    return new mods.build.BuildPaths( this.config, false, feedID );
}
Builder.prototype.buildFeed = function( feed, opts ) {
    opts = mods.utils.merge( opts, { saveBuild: true });
    var build = mods.build.newBuildWithBuilder( this, feed, opts );
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
            .then(function writeBuildManifest() {
                Log.debug('[%s] Writing build manifest to %s...', build, manifestPath );
                var manifest = build.genManifest();
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
            .fail(function( err ) {
                Log.error('[%s] Build failure', build, err );
            })
            .done();
        }
        else if( !opts.saveBuild ) {
            // If build save is disabled then still generate a manifest file with the feed ID.
            Log.debug('[%s] Writing build manifest to %s...', build, manifestPath );
            return q.fcall(function() {
                var manifest = build.genManifest();
                var json = JSON.stringify( manifest );
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
