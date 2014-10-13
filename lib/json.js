//var q = require('q');
var q = require('semo/lib/q').Q;

'use strict';

var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
var meta = {    // table of character substitutions
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\f': '\\f',
    '\r': '\\r',
    '"' : '\\"',
    '\\': '\\\\'
}

function quote(string) {
    // If the string contains no control characters, no quote characters, and no
    // backslash characters, then we can safely slap some quotes around it.
    // Otherwise we must also replace the offending characters with safe escape
    // sequences.
    escapable.lastIndex = 0;
    return escapable.test(string) ? '"' + string.replace(escapable, function (a) {
        var c = meta[a];
        return typeof c === 'string'
            ? c
            : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
    }) + '"' : '"' + string + '"';
}

function pstr(key, holder, rep, gap, indent) {
    return str(key, holder, rep, gap, indent)
    .then(function( value ) {
        return [ key, value ];
    });
}

function str(key, holder, rep, gap, indent) {
    // Produce a string from holder[key].
    var i,          // The loop counter.
        k,          // The member key.
        v,          // The member value.
        length,
        partial,
        value = holder[key];

    // If the value has a toJSON method, call it to obtain a replacement value.
    if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
        value = value.toJSON(key);
    }
    return q( value )
    .then(function( value ) {

        // If we were called with a replacer function, then call the replacer to
        // obtain a replacement value.
        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

        // What happens next depends on the value's type.
        switch (typeof value) {
        case 'string':
            return q( quote(value) );

        case 'number':
            // JSON numbers must be finite. Encode non-finite numbers as null.
            return q( isFinite(value) ? String(value) : 'null' );

        case 'boolean':
        case 'null':
            // If the value is a boolean or null, convert it to a string. Note:
            // typeof null does not produce 'null'. The case is included here in
            // the remote chance that this gets fixed someday.

            return q( String(value) );

            // If the type is 'object', we might be dealing with an object or an array or
            // null.

        case 'object':
            // Due to a specification blunder in ECMAScript, typeof null is 'object',
            // so watch out for that case.
            if (!value) {
                return q('null');
            }
            partial = [];
            // Make an array to hold the partial results of stringifying this object value.
            gap += indent;
            // Is the value an array?
            if (Object.prototype.toString.apply(value) === '[object Array]') {
                // The value is an array. Stringify every element. Use null as a placeholder
                // for non-JSON values.
                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value, rep, gap, indent) || q('null');
                }
                return q.all( partial )
                .then(function( partial ) {
                    // Join all of the elements together, separated with commas, and wrap them in
                    // brackets.
                    v = partial.length === 0
                        ? '[]'
                        : gap
                            ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + gap + ']'
                            : '[' + partial.join(',') + ']';
                    return v;
                });
            }

            // If the replacer is an array, use it to select the members to be stringified.
            if (rep && typeof rep === 'object') {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    k = rep[i];
                    if (typeof k === 'string') {
                        partial.push( pstr(k, value, rep, gap, indent) );
                    }
                }
            }
            else {
                // Otherwise, iterate through all of the keys in the object.
                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        partial.push( pstr(k, value, rep, gap, indent) );
                    }
                }
            }
            return q.all( partial )
            .then(function( pairs ) {
                // Filter out undefined values and format key/value property pairs.
                var partial = pairs 
                .filter(function( pair ) {
                    return pair[1] !== undefined;
                })
                .map(function( pair ) {
                    return (quote(pair[0]) + (gap ? ': ' : ':') + pair[1]);
                });

                // Join all of the member texts together, separated with commas,
                // and wrap them in braces.
                var v = partial.length === 0
                        ? '{}'
                        : gap
                            ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + gap + '}'
                            : '{' + partial.join(',') + '}';
                return v;
            });
        }
    });
}

// Return a promise resolving to value's JSON representation.
// Objects under value can have asynchronous toJSON methods which return promises
// resolving to the required result.
exports.stringify = function (value, replacer, space) {
    // The stringify method takes a value and an optional replacer, and an optional
    // space parameter, and returns a JSON text. The replacer can be a function
    // that can replace values, or an array of strings that will select the keys.
    // A default replacer method can be provided. Use of the space parameter can
    // produce text that is more easily readable.

    var i;
    var gap = '';
    var indent = '';
    var rep = replacer;

    // If the space parameter is a number, make an indent string containing that
    // many spaces.

    if (typeof space === 'number') {
        for (i = 0; i < space; i += 1) {
            indent += ' ';
        }

    }
    // If the space parameter is a string, it will be used as the indent string.
    else if (typeof space === 'string') {
        indent = space;
    }

    // If there is a replacer, it must be a function or an array.
    // Otherwise, throw an error.
    if (replacer && typeof replacer !== 'function' &&
            (typeof replacer !== 'object' ||
            typeof replacer.length !== 'number')) {
        throw new Error('JSON.stringify');
    }

    // Make a fake root object containing our value under the key of ''.
    // Return the result of stringifying the value.
    return str('', {'': value}, rep, gap, indent);
};
