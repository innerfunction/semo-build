var Log = require('log4js').getLogger('semo-build/zip');
var q = require('semo/lib/q');
var format = require('util').format;
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var path = require('path');
var temp = require('temp');
var fs = require('fs');

// Create a zip file.
// @zipFile:        The zip file name.
// @contentPath:    The location of the contents of the zip file.
// @files:          An optional list of files to include.
//                  File paths are relative to @contentPath.
function zip(zipFile, contentPath, files ) {
    var zipPath = path.resolve( zipFile );
    contentPath = path.resolve( contentPath );
    Log.debug('Creating zip file at %s...', zipPath );
    var dp = q.defer();
    files = files ? files.join(' ') : '*';
    var cmd = format('cd %s && zip -r %s %s', contentPath, zipPath, files );
    var ps = exec( cmd, function( err, stdout, stderr ) {});
    ps.on('exit', function( err ) {
        switch( err ) {
        case 0:
            dp.resolve();
            break;
        case 15:
            var msg = format('Unable to open zip file for writing: %s', zipPath );
            dp.reject( new Error( msg ) );
            break;
        default:
            dp.reject( new Error( format('zip command exit code %s', err ) ) );
        }
    });
    return dp.promise;
}

// Queues of pending diffZip ops, keyed by result zip file path.
// Diff-zip ops are queued this way to ensure that only one of each zip file
// is being created at any one time. If additional requests to generate a zip
// file are received whilst an original op to create the same file is in progress,
// then they are added to the end of the op queue so that they can be notified
// (i.e. by having their promise resolved) once the file has been created.
var PendingDiffZipOps = {};

// Create a content diff zip file.
// @zipFile:        The zip file name.
// @contentPath:    The location of the zip file contents.
// @diff:           A build diff, specifying changed, added and deleted files.
// @manifest:       A build manifest.
function diffZip( zipFile, contentPath, diff, manifest ) {
    var dp = q.defer();
    var opq = PendingDiffZipOps[zipFile];
    if( opq ) {
        // A request to generate this zip file is already pending; queue the deferred
        // promise for resolution once the pending op has completed.
        opq.push( dp );
    }
    else {
        // No pending ops on this zip file exist. Create a new pending queue, and then
        // perform the op.
        // (NOTE: It is assumed that requests sharing the same zip file path will also
        // have the same content path, diff and manifest; i.e. will produce identical
        // zip files).
        PendingDiffZipOps[zipFile] = [ dp ];
        // The temp working dir.
        var tempPath;
        // Get list of changed + added files.
        var files = diff.changes.concat( diff.additions );
        // Create temp dir
        q.nfcall( temp.mkdir, { prefix: 'semobuild-', suffix: '-diffzip' } )
        .then(function copyFiles( _tempPath ) {
            tempPath = _tempPath;
            var dp = q.defer();
            if( files.length > 0 ) {
                Log.debug('[diffZip] Copying %d files to %s...', files.length, tempPath );
                // Resolve all file paths to absolute.
                var args = files.map(function( file ) {
                    return path.resolve( contentPath, file );
                });
                // Add output path as final cp arg.
                args.push( tempPath );
                // Copy files to temp dir.
                spawn('cp', args )
                .on('close', function( err ) {
                    if( err == 0 ) {
                        dp.resolve();
                    }
                    else {
                        dp.reject( format('cp to %s failed with error code %d', tempPath, err ));
                    }
                });
            }
            else {
                Log.debug('[diffZip] No changed files');
                dp.resolve();
            }
            return dp.promise;
        })
        .then(function writeManifest() {
            // Write build manifest
            Log.debug('[diffZip] Generating build manifest...');
            manifest.files = files;
            manifest.fileDeletions = diff.deletions;
            var json = JSON.stringify( manifest );
            var manifestPath = path.resolve( tempPath, 'manifest.json');
            return q.nfcall( fs.writeFile, manifestPath, json );
        })
        .then(function createZipFile() {
            // Create zip file
            Log.debug('[diffZip] Generating zip file...');
            return zip( zipFile, tempPath );
        })
        .then(function resolve() {
            // Notify all queued requesters of the op completion, then delete the queue.
            PendingDiffZipOps[zipFile].forEach(function( dp ) {
                dp.resolve();
            });
            delete PendingDiffZipOps[zipFile];
        })
        .fail(function diffZipError( err ) {
            // Notify all queued requesters of the op failure, then delete the queue.
            PendingDiffZipOps[zipFile].forEach(function( dp ) {
                dp.reject( err );
            });
            delete PendingDiffZipOps[zipFile];
        })
        .done();
    }
    return dp.promise;
}

exports.zip = zip;
exports.diffZip = diffZip;
