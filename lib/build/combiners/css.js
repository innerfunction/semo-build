var q = require('semo/lib/q');
var inherits = require('util').inherits;
var parser = require('./css-parser');

// A combiner which combines css content into a single set of styles.
// The css merge performed here will combine multiple rules sharing the same
// selector and/or media query into a single rule with the same selector + query.
// TODO: Include a minimization step.
exports.combiner = function( scope ) {

    inherits( Combiner, scope.Content );

    Combiner.prototype.data = scope.am(function( ctx ) {
        var self = this;
        // Resolve the contents of the items passed to the combiner.
        return q.seqall( this._items.map(function( item ) {
            // TODO: See suggested change in cx.js to File interface:
            //       File.data() (replacing File.data() - returning data)
            //       File.content() - return Content (if needed)
            //     + File.text()
            // Changes would simplify this function.
            if( item instanceof scope.File ) {
                return item.content();
            }
            if( item instanceof scope.Content ) {
                return item.text();
            }
            if( typeof item == 'string' ) {
                return q.Q( item );
            }
            return q.Q('');
        }))
        .then(function( css ) {
            // Parse and merge the css into a single result.
            return css.reduce(function( result, css ) {
                if( result ) {
                    return result.merge( css );
                }
                return parser.parse( css );
            })
            .toString(); // Return the result.
        })
        .done();
    });
    // Combiner needs to be a Content subtype
    function Combiner( items, opts ) {
        this._items = items;
        this._opts = opts;
        this._mimeType = 'text/css';
    }

    return Combiner;
}
