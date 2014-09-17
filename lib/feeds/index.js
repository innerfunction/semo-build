var Log = require('log4js').getLogger('semo-build.feeds');
var setup = require('./setup');
var feedcx = require('./feedcx');

exports.download = function( feedID, fn ) {
    Log.debug('[download] Starting...');
    return setup
    .start( feedID )
    .then(function( scope ) {
        Log.debug('[download] Creating feed context...');
        var cx = feedcx.newContext( scope.record, scope.db );
        Log.debug('[download] Running download script...');
        fn( cx );
        Log.debug('[download] Commiting download ops...');
        return cx.commit();
    });
}
