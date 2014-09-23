var Log = require('log4js').getLogger('semo-build.start');
var q = require('semo/lib/q');
var start = require('semo/core/start');
// Build system components. Each module should export a create() method returning
// an instance of the component. Each component instance should have a start() method.
var components = {
    install: require('./install'),      // Manages installation of feed configurations.
    download: require('./download'),    // Manages performing of feed downloads.
    build: require('./build'),          // Manages performing of feed builds.
    query: require('./query')           // Manages querying of feed builds.
}

// Start core Semo with the specified components.
var components = ['dao','content','images'];
start.startWithComponents( components, function run( ok, config ) {
    try {
        if( ok ) {
            // Create build system components.
            for( var id in components ) {
                Log.debug('Creating "%s" build component...', id );
                components[id] = components[id].create();
            }
            // Start build system components.
            q.all( Object.keys( components ).map(function( id ) {
                var component = components[id];
                return component.start( config, components );
            }))
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
