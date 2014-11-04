var log4js = require('log4js');

var mode;
process.argv.slice( 2 ).forEach(function( arg ) {
    switch( arg ) {
    case '-logconfig':
        mode = arg;
        break;
    default:
        switch( mode ) {
        case '-logconfig':
            log4js.configure( arg );
        }
    }
});

var Log = log4js.getLogger('semo-build.server');
var start = require('./lib/start');
// Start the build system with the full set of components. The installer and publisher
// components are perpetual processes, so the server will continue running once started.
var components = {
    install: require('./lib/installer'),    // Manages installation of feed configurations.
    download: require('./lib/downloader'),  // Manages performing of feed downloads.
    build: require('./lib/builder'),        // Manages performing of feed builds.
    publish: require('./lib/publisher')     // Manages publishing of feed builds.
}
start( components )
.then(function() {
    Log.info('Semo build server running');
})
.fail(function( err ) {
    Log.error( err );
})
.done();
