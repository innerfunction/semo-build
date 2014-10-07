// Item -> File, Content -> Image, Evald
// Item -> Items -> Files, Contents -> Images, Evalds

function Media( query, display ) {
    this.query = query;
    this.display = display;
}
function MediaItem( media, item ) {
    this.media = media;
    this.item = item;
}
MediaItem.prototype.html = function( ctx ) {
    return dust.render( this.template('html'), ctx.push( this ) );
}
MediaItem.prototype.css = function() {
    return dust.render( this.template('css'), ctx.push( this ) );
}
MediaItem.prototype.write = function( filename ) {
    if( this.item instanceof Content ) {
        return new MediaItem( this.media, this.item.write( filename ) );
    }
}
MediaItem.prototype.resize = function( opts ) {
    if( this.item instanceof Image ) {
        return new MediaItem( this.media, this.item.resize( opts ) );
    }
}

// NOTE: There's no substantial difference here between 'MediaCombination' and 'MediaItem' - so 'MediaItem' should possibly be the name.
function MediaCombination( media, items ) {
    this.media = media;
    this.items = items;
}
MediaCombination.prototype.get = function( id ) {
    var item = items.get( id );
    return item && new MediaItem( this.media, item );
}
MediaCombination.prototype.html = function() {
    // template() function needs to resolve the full path of a template, based on the type of the thing in question, and the type of the
    // required output (html here). These should be called component templates. Default component templates are part of the semo-build
    // module; but user build modules should be allowed to override the default and provide their own versions. Also possibly allow component
    // instances to specify the path (relative to the build module dir).
    return dust.render( this.template('html'), ctx.push( this ) );
}
MediaCombination.prototype.css = function() {
    return dust.render( this.template('css'), ctx.push( this ) );
}
MediaCombination.prototype.write = function( filename ) {
    if( Contents.isWriteable( this.items ) ) {
        var files = this.items.write( filename );
        return files && new MediaCombination( this.media, files );
    }
}
MediaCombination.prototype.resize = function( opts ) {
    if( Images.isResizeable( this.images ) ) {
        var images = this.images.resize( opts );
        return images && new MediaCombination( this.media, images );
    }
}

function Montage( images, opts ) {
    this.images = images;
    this.opts = opts;
}
// write() -> MontageFile
// get() -> Tile
// html() -> Tile* .html()
// css() -> Tile* .css()

function MontageFile( montage, filename ) {
    this.montage = montage;     // content
    this.filename = filename;
}

function Tile( montage, idx ) {
    this.montage = montage;
    this.idx = idx;
}
// write() -> Noop
// get() -> Noop
// html()
// css()

