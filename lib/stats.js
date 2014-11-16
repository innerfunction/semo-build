var q = require('semo/lib/q');

module.exports = function() {
    var start = require('./start');
    start({})
    .then(function( components ) {
        var db = components.db;
        return db.getUniqueBuildFeedIDs()
        .then(function( feeds ) {
            var ops = feeds.map(function( feed ) {
                return function() {
                    console.log('Feed: %s', feed );
                    return db.getFeedBuilds( feed )
                    .then(function( builds ) {
                        console.log('  Builds: %d', builds.length );
                        return db.getFeedPosts( feed );
                    })
                    .then(function( posts ) {
                        console.log('  Posts: %d', posts.length );
                        console.log();
                    });
                }
            });
            return q.seqall( ops );
        });
    })
    .then(function() {
        console.log('Done');
    })
    .fail(function( err ) {
        console.log( err );
    })
    .done();
}
