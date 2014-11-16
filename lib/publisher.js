var Log = require('log4js').getLogger('semo-build.publish');
var q = require('semo/lib/q');
var mods = {
    build:  require('./build'),
    fs:     require('fs'),
    odiff:  require('./odiff'),
    path:   require('path'),
    uspace: require('semo/lib/uspace'),
    utils:  require('semo/lib/utils'),
    zip:    require('./zip')
}
var jsdiff = require('./utils').jsdiff;

// Compare two build file objects. Compares their size and sum property values.
// Passed to the odiff function when comparing two builds.
function eqfile( f1, f2 ) {
    return f1.sum == f2.sum && f1.size == f2.size;
}

// Return the public URL for a content zip file.
Publisher.prototype.makeZipURL = function( zipPath ) {
    zipPath = mods.path.relative( this.publishPath, zipPath );
    return this.zipBaseURL+zipPath;
}
// Send a client response indicating no available content update.
Publisher.prototype.noUpdateResponse = function( res ) {
    mods.utils.sendJSON( res, { status: 'no-update' });
}
// Send a client response referencing content updated since a previous, non-current build.
Publisher.prototype.updateSinceResponse = function( paths, currBuild, sinceBuild, res ) {
    var pub = this;
    var zipPath = paths.sinceZip( sinceBuild._id, currBuild._id );
    // Look to see if a zip file already exists containing the differences between the the
    // previous and current build.
    return q.fcall(function() {
        var dp = q.defer();
        mods.fs.exists( zipPath, function( exists ) {
            dp.resolve( exists );
        });
        return dp.promise;
    })
    .then(function( exists ) {
        if( !exists ) {
            Log.info('Creating diff zip %s...', zipPath );
            // Previous zip not found, so create it.
            var contentPath = paths.content( currBuild._id );
            // Build set of file differences.
            var diff = mods.odiff( sinceBuild.files, currBuild.files, eqfile );
            // Create a build record object.
            var build = mods.build.newBuildWithPublisher( pub, currBuild );
            build.since = sinceBuild._id;
            // Build set of meta data differences.
            build.meta = jsdiff( sinceBuild.meta, currBuild.meta );
            // The manifest data. Note that diffZip will add the files list to this data
            // before writing to manifest.json
            var manifest = build.genManifest();
            return mods.zip.diffZip( zipPath, contentPath, diff, manifest );
        }
        else {
            // Zip file found, continue to next step.
            return q.Q('update-since');
        }
    })
    .then(function( status ) {
        var url = pub.makeZipURL( zipPath );
        mods.utils.sendJSON( res, {
            status:     'update-since',
            feed:       currBuild.feedID,
            since:      sinceBuild._id,
            current:    currBuild._id,
            time:       currBuild.time,
            url:        url
        });
    })
    .fail(function( err ) {
        pub.errorResponse( err, res );
    });

}
// Send a client response referencing the current build.
Publisher.prototype.currentContextResponse = function( paths, currBuild, res ) {
    var pub = this;
    var zipPath = paths.contentZip( currBuild._id );
    // Check that a zip file with the current build content exists.
    var dp = q.defer();
    mods.fs.exists( zipPath, function( exists ) {
        try {
            if( exists ) {
                var url = pub.makeZipURL( zipPath );
                mods.utils.sendJSON( res, {
                    status:     'current-content',
                    feed:       currBuild.feedID,
                    current:    currBuild._id,
                    url:        url
                });
            }
            else {
                pub.noContentAvailableResponse( res );
            }
        }
        catch( e ) {
            pub.errorResponse( e, res );
        }
        dp.resolve();
    });
    return dp.promise;
}
// Send a client response indicating that no content is available.
Publisher.prototype.noContentAvailableResponse = function( res ) {
    mods.utils.sendJSON( res, {
        status: 'no-content-available'
    });
}
// Send an error response to the client.
Publisher.prototype.errorResponse = function( err, res ) {
    Log.error( err.cause||err );
    mods.utils.sendJSON( res, { status: 'error', message: 'Internal error' }, 500 );
}
// Get a feed by ID.
Publisher.prototype.getFeed = function( feedid ) {
    var installer = this.components.install;
    return installer && installer.feeds[feedid];
}
// Start the publisher service.
Publisher.prototype.start = function( config, components ) {
    var uspace = new mods.uspace.Service();
    var builder = components.build;
    var pub = this;
    uspace.map({
        // The publisher provides a single URL that accepts the following parameters:
        // @feed:   A feed ID.
        // @since:  A previous build ID (optional). If present, then the publisher will
        //          attempt to return only the differences between that and the current
        //          build.
        '/': function( req, res ) {
            var feed = req.param('feed');
            if( !feed ) {
                mods.utils.sendJSON( res, { status: "error", message: "Missing 'feed' parameter" }, 400 );
                return;
            }
            var since = req.param('since');
            // Read the list of available builds for the specified feed.
            pub.db.getFeedBuilds( feed )
            .then(function( builds ) {
                if( builds.length > 0 ) {
                    // Get build paths for the current feed ID.
                    var buildPaths = builder.paths( feed );
                    if( since ) {
                        // Attempt to find the previous 'since' build.
                        for( var i = 0; i < builds.length; i++ ) {
                            if( builds[i]._id == since ) {
                                if( i == 0 ) {
                                    // Since build is the first i.e. current build, so no
                                    // updates available.
                                    return pub.noUpdateResponse( res );
                                }
                                else {
                                    // Since build is previous to the current build; return only
                                    // the changes between the two builds.
                                    var b0 = builds[0], bs = builds[i];
                                    return pub.updateSinceResponse( buildPaths, b0, bs, res );
                                }
                            }
                        }
                    }
                    // Since build not found, return complete copy of current build.
                    return pub.currentContextResponse( buildPaths, builds[0], res );
                }
                // No builds available for the requested feed.
                return pub.noContentAvailableResponse( res );
            })
            .fail(function( err ) {
                return pub.errorResponse( err, res );
            });
        }
    });

    this.config = config;
    this.components = components;

    this.publishPath = config.get('build.dirs.publish','publish');
    this.zipBaseURL = config.get('build.zipBaseURL','');
    // Ensure that the base URL ends with a slash.
    if( this.zipBaseURL.charAt( this.zipBaseURL.length - 1 ) != '/' ) {
        this.zipBaseURL += '/';
    }

    var port = config.get('build.uspace.port', 8080);
    Log.info('Listening on port %d...', port);
    this.uspace = uspace.start( port ); // TODO: Don't want session creation.
}
function Publisher( db ) {
    this.db = db;
}

exports.create = function( db ) {
    return new Publisher( db );
}
