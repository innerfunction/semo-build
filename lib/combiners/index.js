var format = require('util').format;

exports.init = function( types ) {

    var Combiners = {
        'css':   require('./css').combiner( types ),
        'image': require('./image').combiner( types )
    }

    function combine( type, items, opts ) {
        var Combiner = Combiners[type];
        if( !Combiner ) {
            throw new Error( format('No combiner found for type %s', type ));
        }
        return new Combiner( items, opts );
    }

    return combine;
}
