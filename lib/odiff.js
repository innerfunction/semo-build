// Perform a top-level only diff between two objects.
// Returns the following results:
// * changes: A list of keys common to both objects, but with changed property values.
// * additions: A list of keys present in o2 but not in o1.
// * deletions: A list of keys present in o1 but not in o2.
function odiff( o1, o2, eq ) {
    // Default to standard equality comparison if no equal function provided.
    eq = eq||function( o1, o2 ) { return o1 == o2; }
    // Sorted array of keys on each object.
    var ks1 = Object.keys( o1 ).sort(),
        ks2 = Object.keys( o2 ).sort();
    // Arrays of results.
    var changes = [], additions = [], deletions = [];
    // Iterate over each key array.
    var i = 0, j = 0;
    while( i < ks1.length && j < ks2.length ) {
        // Read key values.
        var k1 = ks1[i], k2 = ks2[j];
        // If keys are equal...
        if( k1 === k2 ) {
            // ...and key property values are not equal...
            if( !eq( o1[k1], o2[k2] ) ) {
                // ...then record as a change.
                changes.push( k1 );
            }
            i++;
            j++;
        }
        else if( k1 < k2 ) {
            // key 1 missing in object 2, record as a deletion.
            deletions.push( k1 );
            i++;
        }
        else if( k1 > k2 ) {
            // key 2 extra key in object 2, record as an addition.
            additions.push( k2 );
            j++;
        }
    }
    if( i < ks1.length ) {
        // Any trailing keys on object 1 are deletions.
        deletions = deletions.concat( ks1.slice( i ) );
    }
    else if ( j < ks2.length ) {
        // Any trailing keys on object 2 are additions.
        additions = additions.concat( ks2.slice( j ) );
    }
    // Return result.
    return {
        changes: changes,
        additions: additions,
        deletions: deletions
    }
}
module.exports = odiff;
