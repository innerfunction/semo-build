var Log = require('log4js').getLogger('semo-build.publisher');
var q = require('semo/lib/q');
var mods = {
    fs:     require('fs'),
    odiff:  require('./odiff'),
    path:   require('path'),
    uspace: require('semo/lib/uspace'),
    utils:  require('semo/lib/utils')
    zip:    require('./zip');
}

Publisher.prototype.makeZipURL = function( zipPath ) {
    var baseURL = this.config.get('build.zipBaseURL');
    zipPath = mods.path.relative( this.buildPath );
    return baseURL+zipPath;
}
Publisher.prototype.noUpdateResponse = function( res ) {
    mods.util.sendJSON( res, {
        status: 'no-update'
    });
}
Publisher.prototype.updateSinceResponse = function( currBuild, sinceBuild, res ) {
    // TODO: Consolidate with builder.Build
    var pub = this;
    var buildPath = mods.path.resolve( this.buildPath, currBuild.feedID, currBuild._id );
    var zipPath = mods.path.resolve( buildPath, sinceBuild._id+'-content.zip');
    return q.nfcall( mods.fs.exists, zipPath )
    .then(function( exists ) {
        if( !exists ) {
            var contentPath = mods.path.resolve( buildPath, 'content');
            var diff = mods.odiff( currBuild.files, sinceBuild.files );
            var files = diff.changes.concat( diff.additions );
            return mods.zip.zip( zipPath, contentPath, files );
        }
        else {
            return q.Q();
        }
    })
    .then(function() {
        var url = this.makeZipURL( zipPath );
        mods.utils.sendJSON( res, {
            status:     'update-since',
            feed:       currBuild.feedID,
            since:      sinceBuild._id,
            current:    currBuild._id,
            url:        url
        });
    })
    .fail(function( err ) {
        pub.errorResponse( err );
    });

}
Publisher.prototype.currentBuildResponse = function( currBuild, res ) {
    var pub = this;
    var zipPath = mods.path.resolve( this.buildPath, currBuild.feedID, currBuild._id, 'content.zip');
    return q.nfcall( mods.fs.exists, zipPath )
    .then(function( exists ) {
        if( exists ) {
            var url = this.makeZipURL( zipPath );
            mods.utils.sendJSON( res, {
                status:     'current-build',
                feed:       currBuild.feedID,
                current:    currBuild._id,
                url:        url
            });
        }
        else {
            return pub.noBuildAvailableResponse( res );
        }
    })
    .fail(function( err ) {
        pub.errorResponse( err );
    });
}
Publisher.prototype.noBuildAvailableResponse = function( res ) {
    mods.utils.sendJSON( res, {
        status: 'no-build-available'
    });
}
Publisher.prototype.errorResponse = function( res ) {
    Log.error( err );
    mods.utils.sendJSON( res, {}, 500 );
}
Publisher.prototype.start = function( config, components ) {
    this.buildPath = config.get('build.path');
    var uspace = new mods.uspace.Service();
    var pub = this;
    uspace.map({
        '/': function( req, res ) {
            var feed = req.params.feed;
            if( !feed ) {
                throw new Error('Missing feed parameter');
            }
            var since = req.params.since;
            pub.db.getFeedBuilds( feed )
            .then(function( builds ) {
                for( var i = 0; i < builds.length; i++ ) {
                    if( builds[i]._id == since ) {
                        if( i == 0 ) {
                            // No updates since.
                            return pub.noUpdateResponse( res );
                        }
                        else {
                            return pub.updateSinceResponse( builds[0], builds[i], res );
                        }
                    }
                }
                // Since build not found, return complete copy of current build.
                if( builds.length > 0 ) {
                    return pub.currentBuildResponse( builds[0], res );
                }
                return pub.noBuildAvailableResponse( res );
            })
            .fail(function( err ) {
                return pub.errorResponse( res );
            });
        }
    });
    var port = config.get('build.uspace.port');
    this.uspace = uspace.start( port ); // TODO: Don't want session creation.
}
function Publisher( db ) {
    this.db = db;
}

exports.create = function( db ) {
    return new Publisher( db );
}
