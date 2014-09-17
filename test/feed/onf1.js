var Log = require('log4js').getLogger('onf1');
var feeds = require('./feeds');

var BaseURL = 'http://onf1.com.mx/api/onf1/%s';

function download( cx ) {
    console.log( cx.lastDownload() );
    var performers = cx.get( BaseURL, 'performers' )
    .posts(function( data ) {
        data = JSON.parse( data );
        return data.posts;
    })
    .map(function( post ) {
        return {
            id:         post.id,
            status:     post.status,
            title:      post.title,
            content:    post.content,
            image:      post.photo
        }
    });
    cx.record({
        performers: performers
    });
}
feeds.download('onf1', download )
.then(function() {
    Log.info('Done!');
})
.fail(function( err ) {
    Log.error( err );
});
