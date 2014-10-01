var Log = require('log4js').getLogger('semo-build.start');
var q = require('semo/lib/q');
var start = require('semo/core/start');
var cdb = require('./cdb');

// Start semo build with the specified semo build component modules.
// Each component module should export a create() method returning
// an instance of the component.
// Each component instance should have a start() method.
// See server.js, semob.js.
module.exports = function( components ) {
    var dp = q.defer();
    // Start core Semo with the specified components.
    var semoComponents = ['dao','content','images'];
    start.startWithComponents( semoComponents, function run( ok, config ) {
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
                // Return the instantiated build components.
                dp.resolve( components );
            });
        }
        else {
            dp.reject('Failed to start Semo');
        }
    });
    return dp.promise;
}
