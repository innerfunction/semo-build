
if( process.argv.length < 5 ) {
    console.log('Usage:');
    console.log('   semob <module name> <feed id> <build dir> [-force] [-noclean] [-save]');
    process.exit( 0 );
}

var Log = require('log4js').getLogger('semob');

// Read command line options.
var argOrder = ['moduleName','feedID','buildDir'];
var args = {};
var opts = { saveBuild: false };

process.argv.slice( 2 ).forEach(function( arg ) {
    switch( arg ) {
    case '-force':
        opts.force = true;
        break;
    case '-noclean':
        opts.clean = false;
        break;
    case '-save':
        opts.saveBuild = true;
        break;
    default:
        args[argOrder.shift()] = arg;
    }
})

// Do the build.
var start = require('./start');
start({
    install: require('./installer'),    // Manages installation of feed configurations.
    download: require('./downloader'),  // Manages performing of feed downloads.
    build: require('./builder')         // Manages performing of feed builds.
})
.then(function( components ) {
    Log.info('Loading feed...');
    var feed = components.install.loadFeed( args.moduleName, args.feedID );
    Log.info('Downloading feed...');
    return components.download.downloadFeed( feed )
    .then(function() {
        Log.info('Building feed...');
        return components.build.buildFeed( feed, opts );
    })
    .then(function() {
        Log.info('Done');
    });
})
.fail(function( err ) {
    Log.error( err );
})
.done();
