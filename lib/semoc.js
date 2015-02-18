var mods = {
    fs:         require('fs'),
    path:       require('path'),
    build:      require('./build'),
    buildcx:    require('./buildcx')
}

if( process.argv.length < 6 ) {
    usage();
    process.exit( 0 );
}

var Log = require('log4js').getLogger('semoc');

// Read command line options.
var argOrder = ['moduleName','buildData','inPath','outPath'];
var mode;
var args = {};
var opts = {};

process.argv.slice( 2 ).forEach(function( arg ) {
    switch( arg ) {
    default:
        switch( mode ) {
        default:
            args[argOrder.shift()] = arg;
        }
        mode = undefined;
    }
})

var moduleName = args.moduleName;
if( /\.\.\//.test( moduleName ) ) {
    moduleName = mods.path.resolve( moduleName );
}
var module = require( moduleName );
if( typeof module.build != 'function' ) {
    console.log('Module %s must have a public "build" function property', args.moduleName );
    process.exit( 1 );
}
var data = JSON.stringify( mods.fs.readFileSync( args.buildData ) );

// Do the build.
var q = require('semo/lib/q');
var start = require('./start');
start({})
.then(function( components ) {
    var build = mods.build.newBuild( components.config, module.build, args.inPath, args.outPath );
    build.data = data;
    return mods.buildcx.exec( build );
})
.fail(function( err ) {
    Log.error( err );
})
.done();

function usage() {
    console.log('Usage:');
    console.log('   semoc <module name> <json file> <in path> <out path>');
}
