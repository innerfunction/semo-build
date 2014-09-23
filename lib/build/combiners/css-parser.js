var log = require('log4js').getLogger('semo.build.css');

// Token for parsing CSS strings.
var Token = new RegExp(
                '^\\s*'+                            // Ignore leading spaces.
                '(?:'+
                '@media\\s*([^{]+)\\s*\\{'+         // Match a media query before open bracket.
                '|([^{}]+[^\\s])\\s*\\{'+           // Match classname before open bracket.
                '|([^{:\\s]+)\\s*:\\s*([^;}]+);?'+  // Match property name followed by colon, property value, optional semi-colon.
                '|(})'+                             // Match closing bracket.
                ')'+
                '(.*)','m');                        // Match trailing characters; do a multiline match.

var ErrorMarker = '/* CSS Parser: ';

// Merge a parse result into a css descriptor.
function mergeInto( name, rule, target ) {
    var c = {};
    c[name.trim()] = rule;
    return merge( target, c );
}

// Parse a CSS string.
function parse( s ) {
    var d = {};
    while( s ) {
        var r = Token.exec( s );
        if( r ) {
            if( r[1] ) {        // Media query
                var q = '@media '+r[1];
                var p = parse( r[6] );
                d = mergeInto( q, p.d, d );
                s = p.s;
            }
            else if( r[2] ) {   // Classname before open bracket.
                var p = parse( r[6] );
                d = mergeInto( r[2], p.d, d );
                s = p.s;
            }
            else if( r[3] ) {   // Property name followed by colon etc.
                d[r[3]] = r[4].trim();
                s = r[6];
            }
            else if( r[5] ) {   // Closing bracket.
                s = r[6];
                break;
            }
            else {
                s = skip( s );
                d[ErrorMarker] = 'Failed to match token > */'+s[0]+'/* < */';
                s = s[1];
            }
        }
        else {
            s = skip( s );
            d[ErrorMarker] = 'Parse error > */'+s[0]+'/* < */';
            s = s[1];
        }
    }
    return { d: d, s: s };
};

function skip( s ) {
    var r = /[^;}](.*)/.exec( s );
    return r||[';',''];
}

// Merge CSS styles from a s(ource) definition into a t(arget) definition.
// Merging allows separate definitions sharing the same classname or media
// query to be merged into a single definition.
function merge( t, s ) {
    for( var id in s ) {
        var v = s[id];
        if( t[id] === undefined ) {
            t[id] = v;
        }
        else if( typeof v == 'string' ) {
            t[id] = v;
        }
        else merge( t[id], v );
    }
    return t;
}

// Serialize a CSS definition object.
function serialize( d ) {
    var s = '';
    Object.keys( d ).sort().forEach(function( id ) {
        s += id;
        var v = d[id];
        if( id == ErrorMarker ) {
            s += v;
        }
        else if( typeof v == 'string' ) {
            s += ': '+v+';';
        }
        else {
            s += ' {'+serialize( v )+'}';
        }
    });
    return s;
}

exports.parse = function( s ) {
    log.debug('Parsing: '+s);
    var d = s ? parse( s ).d : {};
    return {
        d: d,
        merge: function( css ) {
            if( typeof css == 'string' ) {
                css = parse( css ).d;
            }
            else {
                css = css.d||css
            }
            this.d = merge( this.d, css );
            return this.d;
        },
        toString: function() {
            return serialize( this.d );
        }
    };
};
exports.merge = merge;
exports.serialize = serialize;
// Create an empty css object.
exports.empty = function() {
    return exports.parse();
};

/*
var f = process.argv[2];
console.log('loading %s...', f);
var css = require('fs').readFileSync( f ).toString();
css = css.replace(/[\r\n]+/g,'');
var d = parse( css ).d;
console.log( d );
console.log( serialize( merge( d ), '\n'));
*/
