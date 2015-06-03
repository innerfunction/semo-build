var Q = require('q');
var tt = require('./tinytemper');
var spawn = require('child_process').spawn;
var fs = require('fs');
// Comamnd used by the procedure.
var Commands = {
    'CurrentCommit':            "git log --pretty=format:'%h' -n 1",
    'ListUpdatesSinceCommit':   "git diff --name-status {ref} {current}",
    'ZipFilesInCommit':         "git archive -o {zip} {ref} {files}",
    'ListFilesInCommit':        "git show --pretty='format:' --name-only {commit}",
    'AddFileToZip':             "zip {zip} -j {file}",
    'MakeDir':                  "mkdir -p {dir}"
};

/**
 * Execute a named command with the specified arguments.
 * The command name must appear in Commands above. Arguments must
 * be named according to the command template.
 * Returns a promise resolving to the command's stdout. The stdout
 * is parsed into an array of output lines.
 */
function exec( name, args ) {
    var dp = q.defer();
    var cmdline = tt.eval( Commands[name], args||{} ).split(' ');
    var cmd = cmdline[0], args = cmdline.slice( 1 );
    var stdout = new Buffer(), stderr = new Buffer();
    var proc = spawn( cmd, args );
    proc.stdout.on('data', function( data ) {
        stdout.concat( data );
    });
    proc.stderr.on('data', function( data ) {
        stderr.concat( data );
    });
    proc.on('close', function() {
        if( stderr.length > 0 ) {
            dp.reject( stderr.toString() );
        }
        else {
            dp.resolve( stdout.toString().split('\\n') );
        }
    });
    return dp.promise;
}

/**
 * Create a zip file containing all updates since a reference commit.
 * Returns a promise resolving to the filename of the zip file.
 */
function packageUpdates( ref ) {
    var args = {
        ref: ref
    };
    // Start by getting the hash of the latest commit.
    return exec('CurrentCommit')
    .then(function( current ) {
        args.current = current;
        args.zip = tt.eval('{current}/{ref}.zip', args );
        // Check if a zip file for the current and reference commits
        // has already been created.
        return Q.nfcall( fs.stat, args.zip )
        .then(function() {
            return true;
        })
        .fail(function() {
            return false;
        });
    })
    .then(function( exists ) {
        if( exists ) {
            // Zip file exists, return path.
            return args.zip;
        }
        // Get a list of files updated since the reference commit.
        // Note that this won't contain information on all deletes.
        return exec('ListUpdatesSinceCommit', args )
        .then(function( files ) {
            args.files = files;
            // Make an output directory for the zip file.
            return exec('MakeDir', { dir: args.current })
            .then(function() {
                // Create a zip file containing all the updated files.
                return exec('ZipFilesInCommit', args );
            });
        })
        .then(function() {
            // List all files in the reference commit. This is the
            // first step to detect all files deleted since the
            // reference commit.
            return exec('ListFilesInCommit', { commit: ref });
        })
        .then(function( files ) {
            // Create an object to quickly lookup the files in the
            // reference commit.
            files = files.reduce(function( result, file ) {
                result[file] = true;
            }, {});
            return Q( files );
        })
        .then(function( fileset ) {
            // List all files in the current commit...
            return exec('ListFilesInCommit', { commit: args.current })
            .then(function( currFiles ) {
                // ...then delete all matching file names from the
                // reference set.
                files.forEach(function( file ) {
                    delete fileset[file];
                });
                // What is left in fileset are the files in the reference
                // commit which aren't in the current commit - i.e.
                // the files deleted since the reference commit.
                return Object.keys( fileset );
            });
        })
        .then(function( deletes ) {
            // Generate the manifest file.
            var manifest = {
                commit:     args.current,
                deletes:    deletes
            };
            var filename = tt.eval('{current}/.manifest', args );
            return Q.nfcall( fs.writeFile, filename, JSON.stringify( manifest ) )
            .then(function() {
                // Add the manifest file to the zip archive.
                return exec('AddFileToZip', { zip: args.zip, file: filename });
            });
        })
        .then(function() {
            // Return path to zip file as result.
            return args.zip;
        });
    }):
}
