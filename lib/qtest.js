var Q = require('q');

Q.fcall(function() {
    return Q.fcall(function() {
        throw new Error('!');
    })
    .fail(function( e ) {
        console.log('*', e );
        return Q.resolve('ok');
    });
})
.then(function( ok ) {
    console.log( ok );
})
.fail(function( err ) {
    console.log( err );
})
.done();
