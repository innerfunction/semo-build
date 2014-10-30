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
    if( !meta ) {
        return undefined;
    }
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
            // If the update is null...
            if( update === null ) {
                // ...then record the record ID as a deletion.
                deletes.push( recordID );
            }
            else if( update !== undefined ) {
                // -- HACK --
                // jsdiff will only include updated properties - this will strip out the ID field
                // for udpate records; so need to add the ID field back into the update data.
                update.id = recordID;
                // -- HACK --
                // ...else if the update isn't undefined, then output as an update.
                updates.push( update );
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
