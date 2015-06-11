var log4js = require('log4js');

var Log = log4js.getLogger('semo-build.server');
var start = require('./lib/start');
// Start the build system with the full set of components. The installer and publisher
// components are perpetual processes, so the server will continue running once started.
var components = {
    amqp:       require('./lib/amqp'),          // An AMQP client; receives notification of feed updates.
    install:    require('./lib/installer'),     // Manages installation of feed configurations.
    download:   require('./lib/downloader'),    // Manages performing of feed downloads.
    build:      require('./lib/builder'),       // Manages performing of feed builds.
    publish:    require('./lib/publisher')      // Manages publishing of feed builds.
}

var mode;
process.argv.slice( 2 ).forEach(function( arg ) {
    switch( arg ) {
    case '-builder':
    case '-logconfig':
    case '-loglevel':
        mode = arg;
        break;
    case '-nopublish':
        Log.info('Disabling publish component');
        delete components.publish;
        break;
    default:
        switch( mode ) {
        case '-builder':
            if( arg == 'v2' ) {
                Log.info('Using builder v2');
                components.build = require('./lib/builder.v2');
            }
            break;
        case '-logconfig':
            log4js.configure( arg );
            break;
        case '-loglevel':
            log4js.setGlobalLogLevel( arg );
            break;
        }
    }
});

start( components )
.then(function() {
    Log.info('Semo build server running');
})
.fail(function( err ) {
    Log.error( err );
})
.done();
