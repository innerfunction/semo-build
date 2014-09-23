var Log = require('log4js').getLogger('semo-build/install/db');
var q = require('semo/lib/q');

// Initialize the couchdb by ensuring that the semo-build-install design document is
// up to date with the correct view definition.
exports.start = function( config ) {
    var dp = q.defer();
    Log.debug('Initializing db...');
    var dao = config.get('components.dao');
    if( !dao ) {
        Log.error('DAO component not found');
        dp.reject();
    }
    else if( !dao.db ) {
        Log.error('DB connection not found on DAO component');
        dp.reject();
    }
    else dao.db.updateDesign('semo-build-install', { views: views }, function done( ok ) {
        if( ok ) {
            Log.debug('Updated design doc');
            dp.resolve();
        }
        else {
            Log.error('Failed to update design doc');
            dp.reject();
        }
    });
    return dp.promise;
}
