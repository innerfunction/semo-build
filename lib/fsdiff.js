// File system diff.
// 1. List files in 'input' and 'output' dirs.
// 2. Files under 'input' but not 'output' are deletions.
// 3. Files under 'output' but not 'input' are additions.
// 4. Files under both but with different checksums are edits.
// 5. Output a JSON file with the following properties:
//      * deletes: A list of deleted files.
//      * changes: A list of new or edited files.

var q = require('semo/lib/q');
var Log = require('log4js').getLogger('semo/fsdiff');
var format = require('util').format;
var mods = {
    cmds:   require('semo/build/commands'),
    path:   require('path')
}

// Find all files under the specified path.
function find( path ) {
    var dp = q.defer();
    mods.cmds.find( path, '*', false, true, function( files ) {
        files = files
        .filter(function( file ) { return !!file; })    // Filter out any empty lines.
        .sort();                                        // Sort alphabetically.
        dp.resolve( files );
    });
    return dp.promise;
}

// Compare files using checksums.
function compare( input, inpath, output, outpath ) {
    return function() {
        return q.all([
            // Get checksums for the two files being compared.
            mods.cmds.q.chksum( mods.path.resolve( input, inpath ) ),
            mods.cmds.q.chksum( mods.path.resolve( output, outpath ) )
        ])
        .then(function( chksums ) {
            if( chksums[0].sum == chksums[1].sum ) {
                // If checksums are equal then the two files are the same; return false
                // to indicate that the comparison shouldn't be included in the output.
                return q.Q( false );
            }
            else {
                // Checksums are different so files are different - return comparison result.
                return q.Q({ type: 'changes', path: outpath });
            }
        });
    }
}

// Mark a file deletion.
function deletion( inpath ) {
    return function() {
        return q.Q({ type: 'deletes', path: inpath });
    }
}

// Mark a file addition.
function addition( outpath ) {
    return function() {
        return q.Q({ type: 'changes', path: outpath });
    }
}

// Do a file system diff.
function fsdiff( input, output ) {
    Log.info('fsdiff %s %s', input, output );
    // Convert input/output paths to absolute paths.
    input = mods.path.resolve( input );
    output = mods.path.resolve( output );
    // Find files under the input and output directories.
    return q.all([ find( input ), find( output )])
    .then(function( files ) {
        var infiles = files[0];     // List of files under input dir.
        var outfiles = files[1];    // List of files under output dir.
        var ps = [];                // List of comparison promises.
        var i = 0, j = 0;
        Log.info('Comparing %d input, %d output files', infiles.length, outfiles.length );
        // Compare file lists.
        while( infiles[i] && outfiles[j] ) {
            // If files are equal then compare checksums.
            if( infiles[i] == outfiles[j] ) {
                ps.push( compare( input, infiles[i], output, outfiles[j] ) );
                i++;
                j++;
            }
            // If infiles are less than outfiles then implies a deletion.
            while( infiles[i] && infiles[i] < outfiles[j] ) {
                ps.push( deletion( infiles[i] ) );
                i++;
            }
            // If outfiles are greter than outfiles then implies an addition.
            while( outfiles[j] && infiles[i] > outfiles[j] ) {
                ps.push( addition( outfiles[j] ) );
                j++;
            }
        }
        // Tail deletions.
        while( i < infiles.length ) {
            ps.push( deletion( infiles[i] ) );
            i++;
        }
        // Tail additions.
        while( j < outfiles.length ) {
            ps.push( addition( outfiles[j] ) );
            j++;
        }
        // Resolve the list of comparison promises (in sequence, to avoid running out of file handles)
        return q.seqall( ps );
    })
    .then(function( results ) {
        // Reduce the list of results to an object with 'changes' and 'deletes' lists.
        return results
        .reduce(function( result, item ) {
            if( item ) {
                result[item.type].push( item.path );
            }
            return result;
        }, { deletes: [], changes: [] });
    });
}

if( process.argv.length > 3 ) {
    fsdiff( process.argv[2], process.argv[3] )
    .then(function( result ) {
        if( process.argv[4] == '--textchanges' ) {
            console.log( result.changes.join('\n') );
        }
        else {
            console.log( JSON.stringify( result, null, '\t' ));
        }
    })
    .fail(function( err ) {
        Log.error( err );
    });
}
else {
    console.log('fsdiff <input> <output> [--textchanges]');
}
