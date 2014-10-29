// Default method for serializing manifest meta data.
// Takes a set of db updates in the following format:
//      update ::= {
//          <table name> : {
//              <record ID> : { <record values> } *
//          } *
//      }
// i.e. an object -
// - whose keys are table names, mapped to a set of updates
// - each update set is keyed by table record unique ID, onto
//   an object of column name/value pairs.
// Rewrites this format so that each table update is described
// as an array of record values. Any record IDs mapped to null
// are instead serialized as an array of record deletions.
exports.serializeManifestMeta = function( meta ) {
    var allUpdates = meta.db;
    var db = {};
    // For each table in the update...
    for( var table in allUpdates ) {
        var tableUpdates = allUpdates[table];
        // Prepare a list of updated and deleted records.
        var updates = [], deletes = [];
        // For each record in the update...
        for( var recordID in tableUpdates ) {
            var update = tableUpdates[recordID];
            // If the updated record isn't null, then output as an update...
            if( update !== null ) {
                updates.push( update );
            }
            else {
                // ...else record the record ID as a deletion.
                deletes.push( recordID );
            }
        }
        // Generate the result for the current table.
        db[table] = {
            updates: updates,
            deletes: deletes
        }
    }
    return { db: db };
}
