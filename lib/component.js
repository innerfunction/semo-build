function html( component ) {
    return function html( chunk, ctx, bodies, params ) {
        return template('body', component, ctx );
    }
}

function head( component ) {
    return function head( chunk, ctx, bodies, params ) {
        return {
            meta:   meta( component ),
            link:   link( component ),
            css:    css( component ),
            script: script( component )
        }
    }
}

exports.htmlForComponent = function( component ) {
    var html = html( component );
    html.body = html;
    html.head = head( component );
}

function render( component, name, ctx ) {
    var find = ctx.get('semo$find');
    ctx = ctx.push( component );
    return dust.renderSource( component.templateName, ctx.push({ name: name }) )
    .then(function renderTemplate( templateName ) {
        templateName = Object.keys( find( templateName ) )[0];
        return dust.render( templateName, ctx );
    });
}

function html( chunk, ctx ) {
    return this.html.body( chunk, ctx );
}
html.body = function( chunk, ctx ) {
    // Add a reference to this component to the set of all referenced components.
    var components = ctx.get('semo$components');
    if( components && this.id ) {
        components[this.id] = this;
    }
    // Return this component's html body.
    return render( this, 'html', ctx );
}
html.css = function( chunk, ctx ) {
    return render( this, 'css', ctx );
}
html.head = function( chunk, ctx ) {
    return Q.all([
        this.meta( chunk, ctx ),
        this.link( chunk, ctx ),
        this.css( chunk, ctx ),
        this.script( chunk, ctx )
    ])
    .spread(function( meta, link, css, script ) {
        return {
            meta:   meta,
            link:   link,
            css:    css,
            script: script
        }
    });
}
html.meta = function( chunk, ctx ) {
    return [];
}
html.link = function( chunk, ctx ) {
    return [];
}
html.script = function( chunk, ctx ) {
    return [];
}

BuildComponent.prototype.html = html;
function BuildComponent( type ) {
    this.type = type;
}

// Render an array of tag descriptions into an array of html lines.
// @param name  The name of the tag being rendered.
// @param tags  An array of tag descriptions. Each tag description is a map
//              of attribute name/value pairs. (But map optionally be a pre-
//              -rendered tag string).
function renderTags( name, tags ) {
    return tags.map(function render( tag ) {
        if( typeof tag == 'string' ) return tag.trim();
        // Sort attribute names before rendering to a string.
        var attrs = Object.keys( tag )
        .sort()
        .reduce(function attrs( result, name ) {
            return format('%s "%s"="%s"', result, name, tag[name] );
        }, '');
        // Render the full tag with attributes.
        return format('<%s%s>', name, attrs );
    });
}

// Merge lines by sorting and removing duplicates.
function mergeLines( lines ) {
    return lines
    .sort()
    .filter(function filter( value, idx, lines ) {
        return value != lines[idx - 1];
    });
}

function generateHead( chunk, ctx ) {
    var find = ctx.get('semo$find');
    var components = ctx.get('semo$components');
    // Iterate over all component IDs...
    var heads = Object.keys( components )
    .map(function getHeads( id ) {
        // ...and extract the head info for each component.
        return components[id].head( chunk, ctx );
    });
    // Resolve all the head info promises...
    return Q.all( heads )
    .then(function merge( heads ) {
        // ...then merge and reduce all head infos to a single head object.
        var head = heads.reduce(function reduce( result, head ) {
            // meta and links are merged as tags...
            result.meta = mergeLines( result.meta, renderTags('meta', head.meta ) );
            result.link = mergeLines( result.link, renderTags('link', head.link ) );
            // css is merged as css...
            result.css = mergeCSS( result.css, head.css );
            // scripts are merged as script (sorted unique string merge?)
            result.script = mergeLines( result.script, head.script );
            return result;
        },
        { meta: [], link: [], css: {}, script: [] });
        // Resolve path to the head template...
        var template = find('semo/head.html'); // NOTE: This is a paraphrase
        // ...and use to render the head info as html.
        return dust.render( template, ctx.push( head ) );
    })
}

// Function for asynchronously generating component head contents.
function $head( chunk, ctx ) {
    // Return a chunk map to defer the contents.
    return chunk.map(function writeChunk( chunk ) {
        // Put a function into the context to be called by the terminal. This will trigger
        // generation of the head section once all other content has been written.
        ctx.head.$head = function() {
            // Generate the component head sections...
            generateHead( chunk, ctx )
            .then(function writeHead( head ) {
                // ...and write into the template result.
                chunk.write( head ).end();
            });
        };
    });
}

// Template terminal to trigger generation of component head contents.
$head.terminal = function( chunk, ctx ) {
    // Look for $head function in context...
    var $head = ctx.get('$head');
    // ...and if found, then invoke.
    if( $head ) $head();
    // Return empty string as terminal value.
    return '';
}

