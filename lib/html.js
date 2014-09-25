// TODO: Images should probably be inline...
var Log = require('log4js').getLogger('semo-build/html');
var htmlp2 = require('htmlparser2');
var q = require('semo/lib/q');
var format = require('util').format;

function openInline( tag, attr ) {
    var inline = { tag: tag, text: '' };
    if( tag == 'a' ) {
        inline.attr = { href: attr.href };
    }
    else if( tag == 'img' ) {
        inline.attr = { src: attr.src };
    }
    return inline;
}

function closeInline( tag ) {
    return { tag: tag, close: true };
}

// Remove unneeded tags from block inlines.
function pruneInlines( block ) {
    var inlines = [], prev;
    block.inlines.forEach(function( item ) {
        // If current item is a close tag to the preceeding item...
        if( prev && item.tag == prev.tag && item.close ) {
            // ...and if the previous tag has content (attributes or text)...
            if( prev.attr || (prev.text && prev.text.length) ) {
                // ...then keep the opening and closing tag.
                inlines.push( item );
                prev = item;
            }
            else {
                // ...else tag is unneeded, remove from inlines.
                inlines.pop();
                prev = inlines[inlines.length - 1];
            }
        }
        else {
            inlines.push( item );
            prev = item;
        }
    });
    block.inlines = inlines;
}

function inlinesToHTML( inlines ) {
    return inlines.reduce(function( html, item ) {
        if( html.length ) {
            html += '\n    ';
        }
        if( typeof item == 'string' ) {
            html += format('%s', item );
        }
        else if( item.close ) {
            html += format('</%s>', item.tag );
        }
        else {
            html += format('<%s', item.tag );
            for( var id in item.attr ) {
                html += format(' %s="%s"', id, item.attr[id] );
            }
            if( item.text && item.text.length ) {
                html += format('>%s', item.text );
                if( item.close ) {
                    html += format('</%s>', item.tag );
                }
            }
            html += '>';
        }
        return html;
    }, '');
}

function newBlock( tag, inline ) {
    if( tag == 'div' ) {
        tag = 'p';
    }
    return { tag: tag, inlines: inline ? [ inline ] : [] };
}

function h( tag ) {
    var h = newBlock('h');
    h.level = Number( tag.charAt( 1 ));
    return h;
}

function blocksToHTML( blocks ) {
    return blocks.reduce(function( html, item ) {
        var many = item.inlines.length > 1;
        html += format('<%s>%s%s%s</%s>\n',
                    item.tag,
                    many ? '\n    ' : '',
                    inlinesToHTML( item.inlines ),
                    many ? '\n' : '',
                    item.tag );
        return html;
    }, '');
}

/**
 * Flatten an HTML document into an array of header/para/img tags.
 * Produces a simplified representation of an HTML document which emphasises the ordering
 * of text and image content. Only basic text formatting is preserved, all other page
 * formatting and structure is discarded.
 */
exports.flatten = function( html ) {
    var dp = q.defer();
    var blocks = [],    // An array of nodes.
        block = false,  // The current block node.
        inline = false; // The current inline node.
    var p = new htmlp2.Parser({
        onopentag: function( name, attr ) {
            switch( name ) {
            case 'p':
            case 'div':
            case 'h1':
            case 'h2':
            case 'h3':
            case 'h4':
            case 'h5':
            case 'h6':
                if( block && block.inlines.length ) {
                    blocks.push( block );
                }
                block = newBlock( name );
                break;
            case 'a':
            case 'b':
            case 'i':
            case 'u':
            case 'ol':
            case 'ul':
            case 'li':
            case 'hr':
            case 'img':
                if( !block ) {
                    block = newBlock('p');
                }
                inline = openInline( name, attr );
                block.inlines.push( inline );
                break;
            }
        },
        ontext: function( text ) {
            // Append text to the current para, or start a new para is non exists.
            text = text.trim();
            if( text.length ) {
                if( !block ) {
                    block = newBlock('p');
                    inline = false;
                }
                if( inline && inline.text ) {
                    if( inline.text.length ) {
                        inline.text = format('%s %s', inline.text, text );
                    }
                    else {
                        inline.text = text;
                    }
                }
                else {
                    inline = false;
                    block.inlines.push( text );
                }
            }
        },
        onclosetag: function( name ) {
            if( block ) {
                // Check for para close.
                if( block.tag == name || (name == 'div' && block.tag == 'p') ) {
                    // Add current node to the node list if it has inline content.
                    if( block.inlines.length ) {
                        blocks.push( block );
                    }
                    // Reset the current node.
                    block = false;
                    inline = false;
                }
                else switch( name ) {
                case 'a':
                case 'b':
                case 'i':
                case 'u':
                case 'ol':
                case 'ul':
                case 'li':
                    block.inlines.push( closeInline( name ) );
                    inline = false;
                    break;
                }
            }
        },
        onend: function() {
            // End of input, return the final node list.
            if( block ) {
                blocks.push( block );
            }
            blocks.forEach(function( block ) {
                pruneInlines( block );
            });
            dp.resolve( blocks );
        }
    });
    p.write( html );
    p.end();
    return dp.promise;
}

console.log(process.argv);
var argv1 = process.argv[1];
if( argv1.substring( argv1.length - 7 ) == 'html.js' ) {
    var fs = require('fs');
    fs.readFile( process.argv[2], function( err, html ) {
        if( err ) {
            console.log( err );
        }
        else exports.flatten( html )
        .then(function( blocks ) {
            console.log( JSON.stringify( blocks, null, 4 ) );
            console.log( blocksToHTML( blocks ) );
        });
    });
}
