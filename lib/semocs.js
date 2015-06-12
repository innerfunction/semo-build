exports.create = function() {
    return {
        start: function( config ) {
            require('semocs').startHTTP( config.get('semocs') );
        }
    }
}
