function( cx ) {
    var posts = cx.get('http://example.com/somefeed?since=%s', cx.lastDownload('yyyy-mm-dd'))
    .posts(function( data ) {
        return data.posts.filter(function( post ) {
            return post.active;
        });
    })
    .map(function( item ) {
        var comments = cx.get('http://example.com/somefeed/comments/%s', item.id)
        .items(function( data ) {
            return data.comments;
        });
        return {
            id: item.postid,
            date: item.date,
            title: item.postTitle,
            comments: comments
        }
    })
    // .map can probably be used for joins, provided a Feed/Post/Posts object is used
    // (rather than just a string); that the op queue is resolved before saving the
    // data result; and provided the Feed/Post/Posts object has a toJSON method.

    cx.record({
        posts: posts
    });
    // -- and/or --
    cx.write( posts );
    // implication here that the download *will always write a download record* which
    // stores the download time etc. there is then the option to either (i) save the
    // downloaded posts data to this record, or (ii) save them separately.
    cx.clean(function( post, record ) {
        return post.version < record.version;
    });
})

Context :: Object
Context.prototype.get = function( url, arguments... ) {} -> Feed
Context.prototype.lastDownload = function( format ) {} -> String
Context.prototype.record = function( data );
Context.prototype.write = function( posts );
Context.prototype.clean = function( function( post, record ) {} ) {}

Post :: Object
Post.prototype.map = function( item ) {} -> Post

Feed :: Post
Feed.prototype.posts = function( item ) {} -> Posts

Posts :: Array[ Post ]
Posts.prototype.map = function( item ) {} -> Posts

