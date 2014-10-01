var Log = require('log4js').getLogger('semo-build.server');
var start = require('./start');
// Start the build system with the full set of components. The installer and publisher
// components are perpetual processes, so the server will continue running once started.
var components = {
    install: require('./installer'),    // Manages installation of feed configurations.
    download: require('./downloader'),  // Manages performing of feed downloads.
    build: require('./builder'),        // Manages performing of feed builds.
    publish: require('./publisher')     // Manages publishing of feed builds.
}
start( components )
.then(function() {
    Log.info('Semo build server running');
})
.fail(function( err ) {
    Log.error( err );
})
.done();
