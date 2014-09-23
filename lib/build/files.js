var q = require('semo/lib/q');
var spawn = require('child_process').spawn;
var mods = {
    cmds:   require('semo/build/commands'),
    path:   require('path')
}

// Find all files of the specified type under the specified path.
// @type:   'f' for file, 'd' for directory.
// Returns a promise resolving to the data written to stdout by the find command.
function findType( path, type ) {
    var dp = q.defer();
    var stdout = [];
    var find = spawn('find', [ path, '-type', type ]);
    find.stdout.on('data', function( data ) {
        stdout.push( data );
    });
    find.on('close', function() {
        stdout = Buffer.concat( stdout ).toString();
        dp.resolve( stdout );
    });
    return dp.promise;
}

// Regex character class of valid filename characters.
var FileNameChars = '[\\w\\d._-]';

// Convert a standard Unix type filename GLOB to a regex.
function globToRegex( glob ) {
    var prefix = '.*';
    // If glob is anchored on current directory, then resolve to an absolute path.
    // This means that globs like './subdir/*.html' will be restricted to a particular
    // location, while globs like '*.html' will match files in any location.
    if( glob.indexOf('./') == 0 ) {
        glob = mods.path.resolve( glob );
        // Prefix is empty string now, because match is from start of path.
        // (Done solely to simplify the search pattern).
        prefix = ''; 
    }
    var re = glob.replace('*', FileNameChars+'+')
                 .replace('?', FileNameChars )
                 .replace('.', '\\.');
    return new RegExp( '^'+prefix+re+'$', 'mg');
}

// Return a function for performing synchronous filename searches under the specified path.
// The search works as follows:
// * Two find commmands are issued, to find all 'file' and 'directory' file types under
//   the specified path (two finds are necessary because BSD unix find doesn't support
//   printing the file type of found files to stdout).
// * The result of each find is kept in memory as the raw text output written to stdout.
// * File searches are then performed by performing a multi-line regex match on each
//   set of find results.
// * The result is returned as an object mapping the full file path name to its file type
//   - 'f' for file, 'd' for directory.
function search( path ) {
    // Resolve the absolute path.
    path = mods.path.resolve( path );
    // Perform 'file' and 'directory' searches.
    return q.all([ findType( path, 'f' ), findType( path, 'd' ) ])
    .then(function( results ) {
        var files = results[0], dirs = results[1];
        // Return a function for performing filename searches using a glob.
        return function( glob ) {
            var matches = {};               // The set of matches.
            var re = globToRegex( glob );   // Convert the glob to a multi-line regex.
            var r;
            while( r = re.exec( files ) ) { // Search for file matches first...
                matches[r[0]] = 'f';
            }
            re = globToRegex( glob );       // Get new regex to reset the search offset.
            while( r = re.exec( dirs ) ) {  // ...then search for dir matches.
                matches[r[0]] = 'd';
            }
            return matches;                 // Return the result.
        }
    });
}

// Return an object mapping all filenames found under the specified path to that file's
// checksum.
function chksums( path ) {
    // Find all 'file' types under the specified path...
    return findType( path, 'f')
    .then(function( files ) {
        // Calculate the checksum of all found files...
        return q.seqall( files.map(function( file ) {
            return mods.cmds.q.chksum( mods.path.resolve( path, file ) )
            .then(function( chksum ) {
                // Return a single object with file and chksum properties.
                return { file: file, chksum: chksum };
            });
        }));
    })
    .then(function( results ) {
        // Results are an array of { file: chksum: } objects; reduce this to a single
        // object mapping each filename to its checksum.
        return results.reduce(function( result, item ) {
            result[item.file] = item.chksum;
            return result;
        }, {});
    });
}

exports.search = search;
exports.chksums = chksums;
/*
search('.')
.then(function( find ) {
    var glob = process.argv[2]||'*';
    console.log(find( glob ));
})
.done();
*/
