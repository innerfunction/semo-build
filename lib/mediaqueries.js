function MediaObject( media, item ) {
    this.media = media;
    this.item = item;
    this.type = 'object';
}
MediaObject.prototype.template = function( ctx ) {

}
MediaObject.prototype.html = function( ctx ) {
    var self = this;
    return this.template( ctx, 'html')
    .then(function( template ) {
        return dust.render( template, ctx.push( self ));
    });
}
MediaObject.prototype.css = function( ctx ) {
    var self = this;
    return this.template( ctx, 'css')
    .then(function( template ) {
        return dust.render( template, ctx.push( self ));
    });
}

util.inherits( MediaContents, MediaObject );
function MediaContent( media, contents ) {
    this.media = media;
    this.item = contents;
    this.contents = contents;
    this.type = 'content';
}
MediaContents.prototype.write = function( filename ) {
    return newMediaObject( this.media, this.item.write( filename ));
}

util.inherits( MediaFiles, MediaObject );
function MediaFiles( media, files ) {
    this.media = media;
    this.item = files;
    this.files = files;
    this.type = 'file';
}

util.inherits( MediaImages, MediaObject );
function MediaImages( media, images ) {
    this.media = media;
    this.item = images;
    this.images = images;
    this.type = 'image';
}
MediaImages.prototype.write = function( path ) {
    var media = this.media;
    return new MediaImageFiles( media, this.images.map(function( image ) {
        // MediaImageFileSet represents a set of image files, i.e. one image file for each media
        // query in media (* although possibly less, if the same file is used for more than one
        // media query);
        // This might imply that this.images on MediaImages is actually an array of MediaImageSets,
        // (as opposed to i.e. an Images) for the same reason, i.e. because each media query 
        // requires a separate output version of each input image.
        // In which case, the next line is replaced with image.write( path ) <= MediaImageSet.write()
        return new MediaImageFileSet( media, image );
        // Question then is whether this can be generalized, to combine with Montages as well as Images.
        // (Possibly by using more general types like ResizableMedia, WriteableMedia?
        // Or just assume/require that all media will be writeable + resizable?)
        // ? MediaObject <=> MediaImageSet ?
    }));
}
MediaImages.prototype.resize = function( opts, filename ) {
    return newMediaObject( this.media, this.images.resize( opts, filename ));
}

function newMediaObject( media, item ) {
    if( item instanceof Contents ) {
        return new MediaContents( media, item );
    }
    if( item instanceof Files ) {
        return new MediaFiles( media, item );
    }
    if( item instanceof Images ) {
        return new MediaImages( media, item );
    }
    return new MediaObject( media, item );
}

exports.attach = function( cx, inPath ) {

}
