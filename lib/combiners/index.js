var format = require('util').format;

// TODO: This has to be reviewed, may not match exactly the call pattern in buildcx.js
exports.combiner = function( scope ) {

    var Combiners = {
        'css':   require('./css').combiner( scope )
        /*
        ,'image': require('./image').combiner( scope )
        */
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
