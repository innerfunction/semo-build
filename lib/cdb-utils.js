var Log = require('log4js').getLogger('semo-build/cdb-utils');
var q = require('semo/lib/q');

// Check that a couchdb design document is up-to-date with the correct view definitions,
// and refresh if necessary.
// @config:         Semo configuration. Must have a reference to the DAO component.
// @designDocID:    The ID of the design document to refresh.
// @views:          The current view definitions.
exports.refreshDesignDoc = function( config, designDocID, views ) {
    var dp = q.defer();
    Log.debug('Refreshing design document %s...', designDocID );
    var dao = config.get('components.dao');
    if( !dao ) {
        Log.error('DAO component not found');
        dp.reject();
    }
    else if( !dao.db ) {
        Log.error('DB connection not found on DAO component');
        dp.reject();
    }
    else dao.db.updateDesign( designDocID, { views: views }, function done( ok ) {
        if( ok ) {
            Log.debug('Refreshed design document %s', designDocID );
            dp.resolve();
        }
        else {
            Log.error('Failed to update design document %s', designDocID );
            dp.reject();
        }
    });
    return dp.promise;
}
