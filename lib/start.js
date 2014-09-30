var Log = require('log4js').getLogger('semo-build.start');
var q = require('semo/lib/q');
var start = require('semo/core/start');
var cdb = require('./cdb');
// Build system components. Each module should export a create() method returning
// an instance of the component. Each component instance should have a start() method.
var components = {
    install: require('./installer'),    // Manages installation of feed configurations.
    download: require('./downloader'),  // Manages performing of feed downloads.
    build: require('./builder'),        // Manages performing of feed builds.
    publish: require('./publisher')     // Manages publishing of feed builds.
}

// Start core Semo with the specified components.
var semoComponents = ['dao','content','images'];
start.startWithComponents( semoComponents, function run( ok, config ) {
    try {
        if( ok ) {
            // Initialize the database.
            cdb.init( config )
            .then(function( db ) {
                // Create build system components.
                for( var id in components ) {
                    Log.debug('Creating "%s" build component...', id );
                    components[id] = components[id].create( db );
                }
                // Start build system components.
                return q.all( Object.keys( components ).map(function( id ) {
                    var component = components[id];
                    return component.start( config, components );
                }));
            })
            .then(function() {
                Log.info('Build system running');
            })
            .done();
        }
        else {
            Log.error('Failed to start Semo');
        }
    }
    catch( e ) {
        Log.error('Starting build system', e );
    }
});
