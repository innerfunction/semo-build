var mods = {
    fs:         require('fs'),
    path:       require('path'),
    build:      require('./build'),
    buildcx:    require('./buildcx')
}

if( process.argv.length < 4 ) {
    usage();
    process.exit( 0 );
}

var Log = require('log4js').getLogger('semoc');

// Read command line options.
var argOrder = ['moduleName','outPath'];
var mode;
var args = {};
var opts = {};

process.argv.slice( 2 ).forEach(function( arg ) {
    switch( arg ) {
    case '-debug':
        opts.debug = true;
        break;
    case '-data':
    case '-in':
        mode = arg;
        break;
    default:
        switch( mode ) {
        case '-data':
            opts.data = JSON.stringify( mods.fs.readFileSync( arg ) );
            break;
        case '-in':
            opts.in = arg;
            break; 
        default:
            args[argOrder.shift()] = arg;
        }
        mode = undefined;
    }
})

// Resolve the build module.
var moduleName = mods.path.resolve( args.moduleName );
var module = require( moduleName );
if( typeof module.build != 'function' ) {
    console.log('Module %s must have a public "build" function property', args.moduleName );
    process.exit( 1 );
}
// Resolve the input path. This can be specified on the command line (see the -in option
// above); or defaults to the location of the build module.
var inPath = opts.in;
if( !inPath ) {
    inPath = require.resolve( moduleName );
    if( mods.fs.statSync( inPath ).isFile() ) {
        inPath = mods.path.dirname( inPath );
    }
}
// Resolve the build data. This can be specified on the command line, using a JSON file (see
// -data option above); or specified on the build module using a 'data' property.
var data = opts.data||module.data;
if( !data ) {
    console.log('Warning: No build data specified');
    data = {};
}
if( opts.debug ) {
    console.log('Module name:',moduleName);
    console.log('Input path:',inPath);
    console.log('Output path:',args.outPath);
}

// Do the build.
var q = require('semo/lib/q');
var start = require('./start');
start({})
.then(function( components ) {
    var build = mods.build.newBuild( components.config, module.build, inPath, args.outPath );
    build.data = data;
    return mods.buildcx.exec( build );
})
.fail(function( err ) {
    Log.error( err );
})
.done();

function usage() {
    console.log('Usage:');
    console.log('   semoc <module name> [-data <json file>] [-in <in path>] <out path> [-debug]');
}
