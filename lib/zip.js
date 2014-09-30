var Log = require('log4js').getLogger('semo-build/zip');
var q = require('semo/lib/q');
var format = require('util').format;
var exec = require('child_process').exec;
var path = require('path');

// Create a zip file.
// @zipFile:        The zip file name.
// @contentPath:    The location of the contents of the zip file.
// @files:          An optional list of files to include.
//                  File paths are relative to @contentPath.
exports.zip = function( zipFile, contentPath, files ) {
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
