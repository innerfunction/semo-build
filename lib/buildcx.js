var q = require('semo/lib/q');
var Log = require('log4js').getLogger('cx');
var dust = require('dust');
var format = require('util').format;
var inherits = require('util').inherits;
var assert = require('assert');
var mods = {
    cmds:   require('semo/build/commands'),
    fs:     require('fs'),
    files:  require('./files'),
    mime:   require('mime'),
    path:   require('path')
}

// Ensure a value is an array. Promotes the value to a single item array if necessary.
function asArray( obj ) {
    return Array.isArray( obj ) ? obj : [ obj ];
}

// Resolve one or more file refs to an array of file paths.
// File refs may be specified using file globs, in which case the ref is expanded to
// an array of matching file names.
function resolveFileRefs( refs, find ) {
    return asArray( refs )
    .reduce(function( result, ref ) {
        // find() function will return an object whose keys are file paths.
        var file = typeof ref == 'string' ? Object.keys( find( ref ) ) : ref;
        return result.concat( file );
    }, []);
}

// Merge the function's arguments into a single object.
function merge() {
    var result = {};
    for( var i = 0; i < arguments.length; i++ ) {
        var arg = arguments[i];
        if( arg !== undefined ) {
            for( var id in arg ) {
                result[id] = arg[id];
            }
        }
    }
    return result;
}

// Make a standard dust.js context.
function dustContext( basePath ) {
    return dust.makeBase({ semo: { basePath: basePath }});
}

// Push a value onto a dust.js context. Create a new context if none exists.
function pushOntoDustContext( ctx, data ) {
    return ctx ? ctx.push( data ) : dust.makeBase( data );
}

// Fetch the 'basePath' property from a dust.js template context.
function semoBasepath( ctx ) {
    var semo = ctx && ctx.get('semo');
    return (semo && semo.basePath)||'';
}

var EmptyFStats = { isDirectory: function() { return false } };

// Get a file's stats, but swallow any errors and return a dummy stats object.
function fstats( path ) {
    return q.nfcall( mods.fs.stat, path )
    .fail(function( err ) {
        return EmptyFStats;
    });
}

// Set of file operations, for queueing on the op q.
var FileOps = {
    // Copy or move a file from source to target. The source and target values can be specified
    // as paths to directories or individual files. All parent directories in the target path
    // will be created as necessary.
    // @op:     The name of the file operation being performed; 'cp' or 'mv'.
    // @source: The file being copied. A File or File subclass.
    // @target: The file or directory being copied to. A plain File instance.
    // @inPath: The path of the input directory.
    cpmv: function( op, source, target, inPath, err ) {
        return function() {
            return source.path()
            .then(function( sourcePath ) {
                // Get stats on source and target paths.
                return q.fcall(function() {
                    return q.all([ fstats( sourcePath ), fstats( target._path ) ]);
                })
                .then(function( stats ) {
                    // Check for directories at source and target locations.
                    var sstat = stats[0], tstat = stats[1];
                    var dir;
                    if( sstat.isDirectory() ) {
                        // cp/mv'ing from a directory - can only cp/mv to a directory.
                        if( !tstat.isDirectory() ) {
                            throw new Error('Cannot %s directory %s to file %s', op, sourcePath, target._path );
                        }
                        dir = target._path;
                    }
                    else if( tstat.isDirectory() ) {
                        // cp/mv'ing from file to directory - rewrite target path to include file name.
                        dir = target._path;
                        target._path = mods.path.resolve( dir, mods.path.basename( sourcePath ) );
                        target.id = target._path;
                    }
                    else {
                        // cp/mv'ing from file to file - extract dir name from target path.
                        dir = mods.path.dirname( target._path );
                    }
                    // Ensure target dir structure exists.
                    return mods.cmds.q.mkdir( dir )
                })
                .then(function() {
                    // Validate and perform required operation.
                    if( op == 'mv' && sourcePath.indexOf( inPath ) == 0 ) {
                        // Can't move files from the input dir, so convert to a copy.
                        op = 'cp';
                    }
                    switch( op ) {
                    case 'cp':
                        Log.debug('cp -R %s %s', sourcePath, target._path );
                        return mods.cmds.q.deepcp( sourcePath, target._path );
                    case 'mv':
                        Log.debug('mv %s %s', sourcePath, target._path );
                        return mods.cmds.q.mv( sourcePath, target._path );
                    default:
                        throw new Error( format('Bad file op: %s', op ));
                    }
                })
                .fail(function( ferr ) {
                    err.message = format( err.message, sourcePath, target._path );
                    err.cause = ferr;
                    throw err;
                });
            });
        }
    },
    // Write a file object's contents to file. The file will be located at the path specified by
    // the file object's path() method.
    write: function( file, err ) {
        return function() {
            return file.path()
            .then(function( path ) {
                return file.content( dustContext( path ) )
                .then(function( content ) {
                    var dir = mods.path.dirname( path );
                    // Ensure parent directory structure exists...
                    return mods.cmds.q.mkdir( dir )
                    .then(function() {
                        return q.nfcall( mods.fs.writeFile, path, content );
                    })
                    .then(function() {
                        Log.debug('fwrite %s', path );
                        return file;
                    })
                    .fail(function( ferr ) {
                        err.message = format( err.message, path );
                        err.cause = ferr;
                        throw err;
                    });
                });
            });
        }
    }
}

var ImageOps = {
    // Resolve image content from an image: URI.
    fromURI: function( is, uri ) {
        var dp = q.defer();
        is.getImage( uri, function( err, image, uri ) {
            if( err ) {
                dp.reject( err );
            }
            else dp.resolve({ image: image, uri: uri });
        });
        return dp.promise;
    },
    // Resolve image content from an Image object.
    fromImage: function( is, image ) {
        return image.baseURI()
        .then(function( baseURI ) {
            if( image.op ) {
                return image.op( baseURI );
            }
            else {
                return ImageOps.fromURI( is, baseURI );
            }
        });
    },
    // Return the URI of an Image object's base image.
    baseURI: function( is, image ) {
        if( image._base ) {
            // Image is derived from another image (i.e. is the result of applying
            // an operation to another image) - return that image's full URI.
            return image._base.fullURI();
        }
        else if( image._uri ) {
            // The image is specified by its URI.
            return q.Q( image._uri );
        }
        else if( image._url ) {
            // The image is specified by source URL.
            return q.nfcall( is.getImageURIForURL, image._url );
        }
        else if( image._path ) {
            // The image is specified by file path.
            return q.nfcall( is.getImageURIForFile, image._path );
        }
        throw new Error('No image reference found on Image object');
    },
    // Return an image's meta data.
    // @iitem:  The image's content item, as returned by the image service.
    meta: function( is, iitem ) {
        return q.nfcall( is.getMeta, iitem );
    },
    // Return a function for resizing an image.
    resize: function( is, opts, err ) {
        // Return a function for resizing an image specified by URI.
        return function( uri ) {
            var dp = q.defer();
            is.getResizedImage( merge({ uri: uri }, opts ), function( ierr, image, uri ) {
                if( ierr ) {
                    err.cause = ierr;
                    dp.reject( err );
                }
                else {
                    dp.resolve({ image: image, uri: uri });
                }
            });
            return dp.promise;
        }
    }
}

// Create a new build context.
// @is:         The Semo image service.
// @find:       A function for search for files by name under the input directory.
// @inPath:     The path to a directory containing the build input files.
// @outPath:    The path to a directory containing the build output files.
// @data:       Data to do the build with.
function newCx( is, find, inPath, outPath, data ) {

    var cx = this;

    // The operation queue.
    var opq = [];

    // Resolve the input and output paths to absolute paths.
    inPath = mods.path.resolve( inPath );
    outPath = mods.path.resolve( outPath );

    // Asynchronous method wrapper for file and image objects below. Allows asynchronous, promise
    // returning functions to be called outside of the context's main commit() loop.
    // Consider the following code:
    //
    //      var img = cx.image('logo.png').resize({ width: 200 });
    //      img.get('logo.png').base64()
    //      .then(function( b64 ) {
    //          ... do something ...
    //      });
    //
    // Without this wrapper, the resize() operation won't have been evaluated before the base64()
    // method is invoked, causing unexpected results.
    // The wrapper works by adding the method the operation queue, ensuring that it is executed
    // in sequence once the surrounding context is committed.
    function am( fn ) {
        return function() {
            var self = this;
            var args = arguments;
            // Find the dust context in the function args.
            var ctx;
            for( var i = 0; i < arguments.length; i++ ) {
                if( dust.isContext( arguments[i] ) ) {
                    ctx = arguments[i];
                    break;
                }
            }
            // If the object's op queue is the same as the in-scope op queue then it implies
            // that the method has been called in-line of a context (because the op queue is
            // replaced on commit, before the op queue is processed). Push the method call
            // onto the op queue, and return a promise resolving to the method result.
            if( this.opq === opq ) {
                var dp = q.defer();
                opq.push(function() {
                    dp.resolve( fn.call( self, ctx ) );
                });
                return dp.promise;
                // Note that execution of the code chained on the promise result may generate
                // new additions to the operation queue. These comprise 2nd/nth phase operations,
                // and require the commit() function to loop over each iteration of op queue until
                // empty.
            }
            else {
                // The object's op queue is different from the current in-scope queue, implying
                // that the in-scope queue has been changed by the context commit() method.
                // Execute the method immediately and return the result.
                return fn.call( self, ctx );
            }
        }
    }

    // Return meta data about this file.
    File.prototype.meta = am(function() {
        var self = this;
        return this.path()
        .then(function( path ) {
            var filename = mods.path.basename( path );
            var ext = mods.path.extname( filename );
            return {
                // The filename, relative to the containing directory path.
                filename:   filename,
                // The filename extension.
                ext:        ext,
                // The filename without the extension.
                name:       filename.substring( 0, filename.length - ext.length ),
                // The path to the containing directory.
                dir:        mods.path.dirname( path )
            }
        });
    });
    // Return the file's MIME type.
    File.prototype.mimeType = am(function() {
        var self = this;
        return this.path()
        .then(function( path ) {
            return self._mimeType||mods.mime.lookup( path );
        });
    });
    // Return the href of the current file as a path relative to the base path of the parent
    // file.
    File.prototype.href = am(function( ctx ) {
        return this.path()
        .then(function( path ) {
            // The output path of the template currently being evaluated.
            var baseDir = mods.path.dirname( semoBasepath( ctx ) );
            return mods.path.relative( baseDir, path );
        });
    });
    File.prototype.path = am(function() {
        return q.Q( this._path );
    });
    // Resolve the file's content.
    File.prototype.content = am(function() {
        /* TODO: Review this - is it ever useful to resolve a Content object for
           a file's content? Should there be content() and data() methods on a File?
        return q.all([ q.nfcall( mods.fs.readFile, this._path ), this.mimeType() ])
        .then(function( results ) {
            var data = results[0], mimeType = results[1];
            return new Content( data, mimeType );
        });
        */
        return q.nfcall( mods.fs.readFile, this._path );
    });
    // Create a new File object.
    function File( ref, target ) {
        assert( typeof ref == 'string','File() @ref must be a string');
        this.source = ref;
        this._path = mods.path.resolve( target||'', this.source );
        this._mimeType = mods.mime.lookup( this.source );
        this.id = this.source;
        this.opq = opq;
    }

    inherits( ContentFile, File );
    ContentFile.prototype.content = am(function( ctx ) {
        //return q.Q( this._content );
        return this._content.data( ctx );
    });
    ContentFile.prototype.path = am(function( ctx ) {
        var self = this;
        return this._content.name( ctx, self._name )
        .then(function( name ) {
            // TODO: Resolve the content's MIME type and use to generate a file extension
            // for the file (assuming the name doesn't already contain a file extension).
            return mods.path.resolve( self._path, name );
        });
    });
    ContentFile.prototype.mimeType = am(function() {
        return this._content.mimeType();
    });
    function ContentFile( content, path, name ) {
        assert( content instanceof Content, 'ContentFile @content must be a Content instance');
        this._content = content;
        this._path = path;
        this._name = name;
        this.id = content.id;
        this.opq = opq;
    }

    inherits( ImageFile, ContentFile );

    // Return the src of the image file - alias for href.
    ImageFile.prototype.src = ImageFile.prototype.href;
    ImageFile.prototype.path = am(function( ctx ) {
        var self = this;
        // Resolve the image's meta data and name.
        return q.all([ this._content.meta(), this._content.name() ])
        .then(function( results ) {
            var meta = results[0], name = results[1];
            // Assume the _path is a templated value, resolve against image meta data.
            return dust.renderSource( self._path, meta )
            .then(function( path ) {
                var ext = mods.path.extname( name );
                // If path doesn't have the same suffix as the image name then
                // assume it's a reference to the image file's parent directory;
                // append the image name to get the full path.
                if( path.substring( path.length - ext.length ) != ext ) {
                    path = mods.path.resolve( path, name );
                }
                return path;
            });
        });
    });
    // Resolve the image file's contents.
    ImageFile.prototype.content = am(function() {
        return this._content.data();
    });
    // An object representing a file containing image data.
    function ImageFile( image, path ) {
        assert( image instanceof Image, 'ImageFile @image must be an Image instance');
        this._content = image;
        this._path = path;
        this.id = image.id||image.uri||image.url||image.path;
        this.opq = opq;
    }

    // Instantiate a new File object.
    function newFile( ref, path ) {
        var file;
        if( ref instanceof File ) {
            file = ref;
        }
        else if( ref instanceof Image ) {
            file = new ImageFile( ref, path );
        }
        else if( ref instanceof Content ) {
            file = new ContentFile( ref, path );
        }
        else {
            file = new File( ref, path );
        }
        return file;
    }

    Content.prototype.name = am(function() {
        return q.Q( this._name );
    });
    Content.prototype.mimeType = am(function() {
        return q.Q( this._mimeType );
    });
    Content.prototype.text = am(function() {
        return this.data()
        .then(function( data ) {
            return data.tostring();
        });
    });
    // Resolve the image and base64 encode the result
    Content.prototype.base64 = am(function() {
        return this.data()
        .then(function( data ) {
            return data.toString('base64');
        });
    });
    // Resolve the image as a data: URI.
    Content.prototype.dataURI = am(function() {
        var self = this;
        return this.base64()
        .then(function( data ) {
            return format('data:%s;base64,%s', self._mimeType, data );
        });
    });
    // Resolve the content data.
    Content.prototype.data = am(function() {
        return q.Q( this._data );
    });
    // Write the content to file.
    Content.prototype.write = function( path ) {
        return newFile( this, path );
    }
    function Content( name, data, mimeType ) {
        this._name = name;
        this._data = data;
        this._mimeType = mimeType;
    }

    inherits( Evald, Content );
    // Return the content's name. This name property is evaluated as a template against the
    // content's template data.
    Evald.prototype.name = am(function( ctx, name ) {
        ctx = pushOntoDustContext( ctx, this._data );
        return dust.renderSource( name||this._name, ctx );
    });
    // Return the content's data. This is generated by evaluating the content's template
    // against the content's template data.
    Evald.prototype.data = am(function( ctx ) {
        var self = this;
        ctx = pushOntoDustContext( ctx, this._data );
        return this.template()
        .then(function( template ) {
            return dust.renderSource( template.toString(), ctx );
        });
    });
    // Return the content's template.
    Evald.prototype.template = am(function() {
        if( this._template instanceof File ) {
            return this._template.content();
        }
        return q.Q( this._template );
    });
    function Evald( template, data, name, mimeType ) {
        this._template = template;
        this._data = data;
        // TODO: How to ensure there is always a meaningful name?
        this._name = name||data.name||data.id||'';
        this.id = data.id||name;
        this._mimeType = mimeType||data.mimeType||'text/html';
    }

    // An object representing image data.
    inherits( Image, Content );

    // Resolve the image's name.
    Image.prototype.name = am(function( ctx, name ) {
        var self = this;
        return this.meta()
        .then(function( meta ) {
            meta.id = self.id;
            return dust.renderSource( name||self._name, meta );
        });
    });
    // Resolve the image as a data: URI.
    Image.prototype.dataURI = am(function() {
        return q.all([ this.base64(), this.meta() ])
        .then(function( results ) {
            var data = results[0], meta = results[1];
            return format('data:%s;base64,%s', meta.mimeType, data );
        });
    });
    // Resolve the image's meta data.
    Image.prototype.meta = am(function() {
        return ImageOps.fromImage( is, this )
        .then(function( content ) {
            return ImageOps.meta( is, content );
        });
    });
    // Resolve the image's MIME type.
    Image.prototype.mimeType = am(function() {
        return this.meta()
        .then(function( meta ) {
            return meta.mimeType;
        });
    });
    // Return a promise resolving to the image's data.
    Image.prototype.data = am(function() {
        return ImageOps.fromImage( is, this )
        .then(function( content ) {
            return content && content.image && content.image.data;
        });
    });
    // Return a promise resolving to the image's base internal Semo URI.
    // This is the image URI before any image transformations are applied.
    Image.prototype.baseURI = am(function() {
        return ImageOps.baseURI( is, this );
    });
    // Return a promise resolving to the image's full internal Semo URI.
    // This is the base image URI + all specified transformations applied.
    Image.prototype.fullURI = am(function() {
        return ImageOps.fromImage( is, this )
        .then(function( content ) {
            return content.uri;
        });
    });
    Image.prototype._name = '{id}.{format}';

    // Return an image ID as the filename less the file extension.
    function imageIDFromFilename( name ) {
        var id = mods.path.basename( name );
        var idx = id.indexOf('.');
        if( idx > 0 ) {
            id = id.substring( 0, idx );
        }
        return id;
    }

    function Image( ref, op ) {
        if( typeof ref == 'string' ) {
            if( /^(http|file):/.test( ref ) ) {
                this._url = ref;
            }
            else if( /^image:/.test( ref ) ) {
                this._uri = ref;
            }
            else {
                this._path = mods.path.resolve( inPath, ref );
            }
            this.id = imageIDFromFilename( ref );
        }
        else if( ref instanceof File ) {
            this._path = ref.source;
            this._name = ref.source;
            this.id = imageIDFromFilename( ref.id );
        }
        else if( ref instanceof Image ) {
            this._url = ref.url;
            this._uri = ref.uri;
            this._path = ref.path;
            this._base = ref;
            this._name = ref._name;
            this.id = ref.id;
        }
        else throw new Error('Bad image reference object');
        this.op = op;
        this.opq = opq;
    }

    Files.prototype = [];
    // Copy a set of files to a destination directory.
    Files.prototype.cp = function( dst ) {
        dst = dst||'';
        var target = mods.path.resolve( outPath, dst );
        // Error is created here, can be thrown by async code if an actual error occurs.
        // Reason for doing this is so that the stacktrace relates to the synchronous code.
        // The async code will add a 'cause' property if an error does occur.
        var err = new Error('Error copying file %s to %s');
        return new Files( this.map(function( file ) {
            var result = new File( target );
            opq.push( FileOps.cpmv('cp', file, result, inPath, err ) );
            return result;
        }));
    }
    // Move a set of files to a destination directory.
    Files.prototype.mv = function( dst ) {
        assert( !!dst, 'Move destination must be specified');
        var target = mods.path.resolve( outPath, dst );
        var err = new Error('Error moving file %s to %s');
        return new Files( this.map(function( file ) {
            var result = new File( target );
            opq.push( FileOps.cpmv('mv', file, result, inPath, err ) );
            return result;
        }));
    }
    // Get a file by ID.
    Files.prototype.get = function( id ) {
        return this.ids[id];
    }
    // Create a Files array from an array of file refs.
    function Files( refs ) {
        var self = this;
        this.ids = {};
        resolveFileRefs( refs, find ).forEach(function( file ) {
            file = newFile( file, inPath );
            self.push( file );
            self.ids[file.id] = file;
        });
    }

    Contents.prototype = [];
    // Write all content items to a set of files.
    // The path can be specified in two ways:
    // * As the path to the directory to contain the content files. Each content file
    //   is then named using the content name.
    // * As a string template resolving to the path to the content file. Only content
    //   types supporting templated names (Image, Evald) support this form.
    Contents.prototype.write = function( path ) {
        path = path||'';
        // If the path looks like a template (because it contains { and } chars)
        // then treat as a name template.
        var name = path.match(/\{[\w\.]\}/) && path;
        // Path is either the full path, or just the inPath, depending on whether a
        // name template has been detected.
        path = name ? inPath : mods.path.join( outPath, path );
        // Create error here, to provide a useful stack trace if an error does occur.
        var err = new Error('Failed to write contents to %s');
        return new Files( this.map(function( content ) {
            var file = content.write( path, name );
            opq.push( FileOps.write( file, err ) );
            return file;
        }));
    }
    // Contents.cp and Contents.mv are aliases for Contents.write; allow the Contents
    // and Images objects to expose a similar API to Files.
    Contents.prototype.cp = Contents.prototype.write;
    Contents.prototype.mv = Contents.prototype.write;
    // Get an image by ID.
    Contents.prototype.get = function( id ) {
        return this.ids[id];
    }
    // Create a Contents array from an array of Content items.
    function Contents( contents ) {
        var self = this;
        // 'ids' allows images on the array to be quickly looked up by image id.
        // useful when need to complete the roundtrip of (1) extracting image ids from
        // an array of posts (2) transforming the images (3) matching the transformed
        // results back to the original post.
        // implies that image ids are unique within an images array!
        this.ids = {};
        asArray( contents ).forEach(function( content ) {
            self.push( content );
            self.ids[content.id] = content;
        });
    }

    //Images.prototype = [];
    inherits( Images, Contents );

    Images.prototype.resize = function( opts ) {
        return new Images( this.map(function( image ) {
            var err = new Error( format('Error resizing image %s', image.id ) );
            return new Image( image, ImageOps.resize( is, opts, err ) );
        }));
    }
    // Create an Images array from an array of image refs.
    function Images( refs ) {
        var self = this;
        // 'ids' allows images on the array to be quickly looked up by image id.
        // useful when need to complete the roundtrip of (1) extracting image ids from
        // an array of posts (2) transforming the images (3) matching the transformed
        // results back to the original post.
        // implies that image ids are unique within an images array!
        this.ids = {};
        resolveFileRefs( refs, find ).forEach(function( image ) {
            // see note above on image name uniqueness - so is a conditional required
            // here, only add image to array if its name not already on the array?
            image = new Image( image );
            self.push( image );
            self.ids[image.id] = image;
        });
    }

    var scope = {
        am: am,
        File: File, Image: Image, Content: Content, 
        Files: Files, Images: Images, Contents: Contents
    }
    var combiner = require('./combiners').combiner( scope );

    var cx = {
        // The build (feed) data.
        data: data,
        // Create a Files array.
        file: function( ref ) {
            return new Files( ref );
        },
        // Create a Files array.
        files: function( refs ) {
            return new Files( refs );
        },
        // Shorthand for cx.file(..).cp(..)
        cp: function( from, to ) {
            return cx.files( from ).cp( to );
        },
        // Create an Images array.
        image: function( ref ) {
            return new Images( ref );
        },
        // Create an Images array.
        images: function( refs ) {
            return new Images( refs );
        },
        // Create a Contents array by evaluating a template file.
        // @template:   The path of the template file (relative to input dir);
        //              Or a File object representing the template.
        // @data        The template data. If an array then each item is evaluated to
        //              produce a single Content item.
        eval: function( template, data ) {
            // template can be:
            // * string -> path relative to input dir
            // * file -> file in either input or output dir
            if( typeof template == 'string' ) {
                template = newFile( template, inPath );
            }
            else if( !(template instanceof File) ) {
                throw new Error('Template argument must reference a file');
            }
            data = asArray( data );
            return new Contents( data.map(function( data ) {
                return new Evald( template, data );
            }));
        },
        // Create a Contents array by rendering a dust.js template.
        // @template:   A dust.js template as a sting.
        // @data        The template data. If an array then each item is evaluated to
        //              produce a single Content item.
        render: function( template, data ) {
            template = template.toString();
            data = asArray( data );
            return new Contents( data.map(function( data ) {
                return new Evald( template, data );
            }));
        },
        // Combine contents.
        combine: combiner,
        // Commit all queued operations.
        commit: function() {
            var dp = q.defer();
            Log.debug('Committing op queue...');
            var n = 1;
            // Process the contents of the op queue.
            function processq() {
                Log.debug('Processing %d ops in %d iteration op queue', opq.length, n++ );
                // Create a new, empty opq, whilst retaining a reference to the current queue.
                var _opq = opq;
                // Assign a new queue to opq.
                opq = [];
                // Process the current queue.
                q.seqall( _opq )
                .then(function() {
                    // Any operations now on the replacement queue represent nth order operations
                    // that need to be processed next.
                    if( opq.length ) {
                        process.nextTick( processq );
                    }
                    else {
                        // No nth order ops left to process, so return.
                        dp.resolve();
                    }
                })
                .fail(function( err ) {
                    Log.error('processq', err );
                    if( err.cause ) {
                        Log.error('Cause:', err.cause );
                    }
                    dp.reject( err );
                });
            }
            processq();
            return dp.promise;
        }
    };
    return cx;
}
exports.newCx = newCx;

exports.exec = function( build ) {
    var dp = q.defer();
    var imageService = build.config.get('components.images');
    return mods.files.search( build.inPath )
    .then(function( find ) {
        var cx = newCx( imageService, find, build.inPath, build.paths.outputRoot, build.data );
        try {
            build.fn( cx );
            cx.commit()
            .then(function done() {
                dp.resolve( build );
            })
            .done();
        }
        catch( e ) {
            Log.error('exec', e );
            dp.reject( e );
        }
    })
    .done();
    return dp.promise;
}

/*
var start = require('semo/core/start');

exports.run = function( inPath, outPath, fn ) {
    var dp = q.defer();
    start.startWithComponents(['dao','content','images'], function( ok, config ) {
        var is = config.get('components.images');
        mods.files.search( inPath )
        .then(function( find ) {
            var cx = newCx( is, find, inPath, outPath );
            try {
                fn( cx );
                dp.resolve( cx.commit() );
            }
            catch( e ) {
                Log.error('exec', e );
                dp.reject( e );
            }
        })
        .done();
    });
    return dp.promise;
}
*/
// When are operations applied?
// - File ops (cp/mv) are added to the queue when called
// - Image transform ops (e.g. resize) are not added to the queue, but transform the image object
// - Image write() causes evaluation of image op(s) before write, entire op added to queue when called
// - Image src/meta/base64 are like write, but are (usually) called from inside a template
// - Template eval() is added to the queue when called

// Minimize/merge operations can be defined as type specific (i.e. css, js specific) functions
// invoked on a Files array.
// Although alternatively, the Array.reduce method could be used with a predefined function.

// An image montage function could fit into one of several patterns - it may be some kind of hybrid,
// as the object needs to represent both a composite image file, and associated css data.

// Images + media queries might be a similar category to image montages; one reason is that the
// individual image identity is lost, together with the ability to use an image's src() method to
// reference that image; instead, the image must be referenced (in html) using css, and the src()
// method is only applicable to the complete set of images.
// > Answer looks to be that the 'Image' type isn't a file; but an 'ImageMontage' type could be a
//   type will associated image and css sets that get written to file.
