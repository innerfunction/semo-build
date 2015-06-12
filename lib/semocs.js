exports.create = function() {
    return {
        start: function( config ) {
            require('semo-content-server').startHTTP( config.get('semocs') );
        }
    }
}
