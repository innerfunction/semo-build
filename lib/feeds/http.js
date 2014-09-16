var Log = require('log4js').getLogger('semo.eventpac.download');
var q = require('semo/lib/q');
var format = require('util').format;
var mods = {
    http:   require('http'),
    url:    require('url')
}

function get( url, type, retry ) {
    retry = retry||0;
    var dp = q.defer();
    Log.info('GETing %s [%d]...', url, retry + 1 );
    var opts = mods.url.parse( url );
    opts.path = opts.pathname+(opts.search||'');
    opts.method = 'GET';
    opts.headers = { 'Accept': type||'application/json' };
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
                    if( res.headers.contentType == 'application/json' ) {
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
        var failure = false;
        if( err == 'Error: read ECONNRESET' ) {
            failure = 'connection reset';
        }
        else if( err == 'Error: read ETIMEDOUT' ) {
            failure = 'connection timeout';
        }
        if( failure && retry < 3 ) {
            retry++;
            Log.warn('GET %s %s, attempting retry %d...', url, failure, retry );
            d.resolve( get( url, type, retry ) );
        }
        else {
            Log.error('GET %s %s', url, err );
            d.resolve();
        }
    });
    req.end();
    return dp.promise;
}

exports.get = get;
