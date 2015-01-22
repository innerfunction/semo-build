/**
 * Usage: module.exports = require('build-core').extend( feed, opts )
 */
exports.extend = function( feed, opts ) {

    function download( cx, url ) {

        var post = cx.get( url ).map(function( post ) {
            var status = post.status;
            var type = feed.postTypes[post.type];
            if( type && type.map ) {
                post = type.map( post );
            }
            post.status = status;
            post.download = cx.$lastDownload;
            return post;
        });

        cx.write( post );

        cx.clean(function( post ) {
            // Idea here is to keep deleted posts for one download cycle, only
            // removing them on the subsequent download.
            // This is done so that deleted posts are visible to the build function,
            // so that it can then cleanup related content.
            // The problem is that multiple downloads may be aggregated before a
            // build takes place, so all deletes won't be visible to the build
            // function.
            // Solution may be to store the last build ID also on the feed record,
            // and use that instead in this case.
            return post.status == 'publish' || post.download = cx.$lastDownload;
        });
    }

    function build( cx ) {

        cx.file( feed.lastBuildPath ).cp(); // or cx.$lastBuildPath?

        var $lastDownload = cx.data.record.$lastDownload;
        // Build only posts updated since last build
        // What about lists, other files composed of multiple posts?
        // How are obsolete files (file deletions) detected?
        var updates = cx.data.posts.filter(function( post ) {
            return post.status == 'publish' && post.download == $lastDownload;
        });
        feed.build( cx, updates );
        var deletes = cx.data.posts.filter(function( post ) {
            return post.status != 'publish' && post.download == $lastDownload;
        });
        feed.remove( cx, deletes );

    }
    var _exports = {
        download: download,
        build: build
    }
    for( var id in opts ) {
        _exports[id] = opts;
    }
    return _exports;
}
