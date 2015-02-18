var Log = require('log4js').getLogger('semo-build.build');
var format = require('util').format;
var mods = {
    cmds:   require('semo/build/commands'),
    path:   require('path'),
    utils:  require('./utils')
}
var serializeManifestMeta = require('./manifest').serializeManifestMeta;

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
    this.outputRoot = feedID ? mods.path.resolve( outPath, feedID ) : outPath;
    var publishDir = config.get('build.dirs.publish','publish');
    this.publishRoot = feedID ? mods.path.join( publishDir, feedID ) : publishDir;
}
// Check whether the current build is different from the previous build.
Build.prototype.hasNewContent = function() {
    var curr = this.files;
    var prev = this.prevBuild && this.prevBuild.files;
    // If no previous build found...
    if( !prev ) {
        return !!curr; // ...then content is new (if there is any)
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
    if( !mods.utils.deepeq( this.meta, this.prevBuild.meta ) ) {
        return true;
    }
    // No changes found, so return false.
    return false;
}
// Create a build record in the db. Assigns the ID of the new couchdb doc to this build.
Build.prototype.createRecord = function() {
    var build = this;
    var seq = (this.prevBuild && this.prevBuild.seq)||0;
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
// Initialize a build with data from the db.
Build.prototype.setRecord = function( record ) {
    this.id = record._id;
    this.rev = record._rev;
    this.paths.buildID = this.id;
    this.time = record.time;
    this.seq = record.seq;
    this.meta = record.meta;
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
    return this.files ? Object.keys( this.files ).sort() : [];
}
// Convert the build object to JSON. Used when writing the build document to the db.
Build.prototype.toJSON = function() {
    return {
        _id:        this.id,
        _rev:       this.rev,
        type:       'build-record',
        feedID:     this.feed.id,
        time:       this.time,
        seq:        this.seq,
        files:      this.files,
        meta:       this.meta
    }
}
// Generate the build's manifest data from its meta data.
Build.prototype.genManifest = function() {
    var manifest = this.serializeMeta( this.meta );
    // Merge additional build manifest values over the user-defined manifest.
    manifest = mods.utils.merge( manifest, {
        buildid:    this.id,           // The build unique ID.
        since:      this.since,
        feedid:     this.feed.id,
        time:       this.time,         // The build time.
        files:      this.filelist()    // A list of the files in this build.
    });
    return manifest;
}
// Return string identifier for build.
Build.prototype.toString = function() {
    return format('build/feed %s %s', this.feed.id, this.timeID );
}
function Build( config, fn, inPath, outPath, feed, db ) {
    this.config = config;
    this.fn = fn;
    this.inPath = inPath;
    this.paths = new BuildPaths( config, outPath, feed && feed.id );
    this.feed = feed;
    this.db = db;
    this.time = new Date();
    this.timeID = this.time.toString().substring( 16, 24 );
    this.serializeMeta = this.config.get('build.serializeManifestMeta', serializeManifestMeta );
}

exports.BuildPaths = BuildPaths;

exports.newBuildWithBuilder = function( builder, feed, opts, record ) {
    var build = new Build( builder.config, feed.build, feed,inPath, opts.buildPath, feed, builder.db );
    if( record ) {
        build.setRecord( record );
    }
    return build;
}

exports.newBuildWithPublisher = function( publisher, record ) {
    var config = publisher.config;
    var feed = publisher.getFeed( record.feedID );
    var build = new Build( config, feed.build, feed.inPath, null, feed, publisher.db );
    build.setRecord( record );
    return build;
}

exports.newBuild = function( config, fn, inPath, outPath ) {
    var build = new Build( config, fn, inPath, outPath );
    return build;
}
