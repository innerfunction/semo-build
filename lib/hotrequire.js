/**
 * A module allowing the hot-loading of required node modules.
 * The module definition will be automatically reloaded if the file containing it is changed.
 * This module exports a function which can be used to require modules. Modules are required
 * by name (same as the normal require function), but instead of returning the module, the
 * hotrequire() function returns an event emitter that emits the following events:
 * - load: When a module is loaded or reloaded; passes the newly loaded module as an argument.
 * - error: If an error occurs when loading a module.
 */
var chokidar = require('chokidar');
var inherits = require('util').inherits;
var events = require('events');
var mods = {
    path: require('path')
}
inherits( HotRequire, events.EventEmitter );

// Load the named module.
HotRequire.prototype.load = function( name ) {
    try {
        // Resolve the module's path and add a file watch to reload.
        var path = require.resolve( name );
        // Get the module's parent dir - used to delete all loaded modules under this location.
        var dir = mods.path.dirname( path );
        var self = this;
        // Watch the module file path and reload the module if the file changes.
        chokidar.watch( path )
        .on('all', function() {
            // Iterate over all cached modules...
            Object.keys( require.cache )
            .forEach(function( mpath ) {
                // If the module path starts with the dir prefix (implying that it is located
                // under the hot-loaded module location)...
                if( mpath.substring( 0, dir.length ) == dir ) {
                    // ...then delete from the cache.
                    delete require.cache[mpath];
                }
            });
            // Resolve the module and emit an event.
            var m = require( name );
            self.emit('load', m );
        });
    }
    catch( e ) {
        this.emit('error', e );
    }
}

function HotRequire( name ) {
    var self = this;
    process.nextTick(function() {
        self.load( name );
    });
}

module.exports = function( name ) {
    return new HotRequire( name );
}
