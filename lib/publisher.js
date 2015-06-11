var Log = require('log4js').getLogger('semo-build.publish');
var Q = require('q');
var mods = {
    fs:     require('fs'),
    path:   require('path'),
    uspace: require('semo/lib/uspace'),
    utils:  require('semo/lib/utils')
}

// Return the public URL for a content zip file.
Publisher.prototype.makeZipURL = function( zipPath ) {
    zipPath = mods.path.relative( this.publishPath, zipPath );
    return this.zipBaseURL+zipPath;
}

// Send a client response indicating no available content update.
Publisher.prototype.noUpdateResponse = function( feed, res ) {
    mods.utils.sendJSON( res, {
        feed:   feed,
        status: 'no-update'
    });
}

// Send a client response referencing content updated since a previous, non-current build.
Publisher.prototype.updateSinceResponse = function( feed, since, result, res ) {
    var url = pub.makeZipURL( zipPath );
    mods.utils.sendJSON( res, {
        status:     'update-since',
        feed:       feed,
        since:      since,
        current:    result.current,
        url:        url
    });
}

// Send a client response referencing the current build.
Publisher.prototype.currentContentResponse = function( feed, result, res ) {
    var url = pub.makeZipURL( zipPath );
    mods.utils.sendJSON( res, {
        feed:       feed,
        status:     'current-content',
        current:    result.current,
        url:        url
    });
}

// Send a client response indicating that no content is available.
Publisher.prototype.noContentAvailableResponse = function( feed, res ) {
    mods.utils.sendJSON( res, {
        feed:   feed,
        status: 'no-content-available'
    });
}

// Send an error response to the client.
Publisher.prototype.errorResponse = function( err, res ) {
    Log.error( err.cause||err );
    mods.utils.sendJSON( res, { status: 'error', message: 'Internal error' }, 500 );
}

// Start the publisher service.
Publisher.prototype.start = function( config, components ) {
    var uspace = new mods.uspace.Service();
    var builder = components.build;
    var pub = this;
    uspace.map({
        // The publisher provides a single URL that accepts the following parameters:
        // @feed:   A feed ID.
        // @since:  A previous build commit hash (optional). If present, then the publisher will
        //          attempt to return only the differences between that and the current commit.
        '/': function( req, res ) {
            var feed = req.param('feed');
            if( !feed ) {
                mods.utils.sendJSON( res, { status: "error", message: "Missing 'feed' parameter" }, 400 );
                return;
            }
            // TODO NOTE: Whenever the app downloads a complete content update - i.e. because it doesn't
            // submit a since; or when the since commit hash isn't recognized (isn't part of the commit
            // history) then it should *completely delete the local subs dir* before unpacking the update;
            // this is to ensure that e.g. in the case of a feed reset, the app doesn't accumulate
            // out of date or obsolete files.
            var since = req.param('since');
            if( !since ) {
                return mod.gitpms.packageCurrent( repoDir, packageDir )
                .then(function( result ) {
                    pub.currentContentResponse( feed, result, res );
                    return Q();
                });
            }
            // Get the current commit hash.
            else mods.gitpms.current( repoDir )
            .then(function( hash ) {
                if( !hash ) {
                    pub.noContentAvailableResponse( feed, res );
                }
                else if( since == hash ) {
                    pub.noUpdateResponse( feed, res );
                }
                else {
                    // TODO: Needs to be something here detecting/handling when 'since' is not a
                    // valid hash - see TODO note above - will following function fail if since
                    // is not a valid hash for the repo? (In which case just need an error
                    // handler).
                    mods.gitpms.packageUpdatesSince( since, repoDir, packageDir )
                    .then(function( result ) {
                        pub.updateSinceResponse( feed, since, result, res );
                    });
                }
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
