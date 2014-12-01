var Log = require('log4js').getLogger('semo-build.download.http');
var q = require('semo/lib/q');
var format = require('util').format;
var mods = {
    agent:  require('agentkeepalive'),
    http:   require('http'),
    url:    require('url')
}
var agent = new mods.agent({
    keepAliveTimeout: 1000
});

// GET an HTTP URL.
// @url:    The URL to get.
// @type:   The MIME type of the Accept: header (optional; defaults to application/json).
// @retry:  The number of retries to attempt (optional; defaults to 3).
function get( url, type, retry ) {
    retry = retry||3;
    var dp = q.defer();
    Log.debug('GETing %s [%d]...', url, retry + 1 );
    var opts = mods.url.parse( url );
    opts.path = opts.pathname+(opts.search||'');
    opts.method = 'GET';
    opts.headers = { 'Accept': type||'application/json' };
    opts.agent = agent;
    var req = mods.http.request( opts, function( res ) {
        if( res.statusCode == 200 ) {
            var buffer = [];
            res.on('data', function( chunk ) {
                buffer.push( chunk );
            });
            res.on('end', function() {
                try {
                    var data = Buffer.concat( buffer ).toString();
                    // Check for BOM (http://en.wikipedia.org/wiki/Byte_Order_Mark) at start of text 
                    // - the node.js JSON parser will reject it.
                    if( data.charCodeAt( 0 ) == 65279 ) {
                        Log.warn('Removing BOM from %s response...', url );
                        data = data.substring( 1 );
                    }
                    if( res.headers['content-type'] == 'application/json' ) {
                        data = JSON.parse( data );
                    }
                    dp.resolve( data );
                }
                catch( e ) {
                    dp.reject( e );
                }
            });
        }
        else {
            dp.reject( new Error( format('%d : %s', res.statusCode, res.status )));
        }
    });
    req.on('error', function( err ) {
        // If an error occurs then check the cause, and attempt a retry for some failure types.
        var failure = false;
        if( err == 'Error: read ECONNRESET' ) {
            failure = 'connection reset';
        }
        else if( err == 'Error: read ETIMEDOUT' ) {
            failure = 'connection timeout';
        }
        // If failure type identified and retries are left...
        if( failure && retry > 0 ) {
            // ...then try again (with one less retry).
            retry--;
            Log.warn('GET %s %s, attempting retry %d...', url, failure, retry );
            dp.resolve( get( url, type, retry ) );
        }
        else {
            // ...else failure not identified, or no retries left; resolve rather than reject
            // the promise, as this isn't a failure condition.
            // TODO: Make resolve vs. reject behaviour an option?
            Log.error('GET %s %s', url, err );
            dp.resolve();
        }
    });
    req.end();
    return dp.promise;
}

exports.get = get;
