/**
 * A module allowing the hot-loading of required node modules.
 * The module definition will be automatically reloaded if the file containing it is changed.
 * This module exports a function which can be used to require modules. Modules are required
 * by name (same as the normal require function), but instead of returning the module, the
 * hotrequire() function returns an event emitter that emits the following events:
 * - load: When a module is loaded or reloaded; passes the newly loaded module as an argument.
 * - error: If an error occurs when loading a module.
 */
var fs = require('fs');
var inherits = require('util').inherits;
var events = require('events');

inherits( HotRequire, events.EventEmitter );

// Load the named module.
HotRequire.prototype.load = function( name ) {
    try {
        // Resolve the module's path and add a file watch to reload.
        var path = require.resolve( name );
        var self = this;
        // Watch the module file path and reload the module if the file changes.
        fs.watch( path, function( event ) {
            // Delete the current copy of the module from the requires cache.
            delete require.cache[path];
            self.load( name );
        });
        // Resolve the module and emit an event.
        var m = require( name );
        this.emit('load', m );
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
