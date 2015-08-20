var amqplib = require('amqplib');
var url = process.argv[2];
var cmd = process.argv[3];
amqplib.connect( url )
.then(function( conn ) {
    conn.createChannel()
    .then(function( ch ) {
        for( var i = 4; i < process.argv.length; i++ ) {
            var name = process.argv[i];
            switch( cmd ) {
            case 'purge':
                console.log('Purging %s...', name );
                ch.purgeQueue( name );
                break;
            case 'delete':
                console.log('Deleting %s...', name );
                ch.deleteQueue( name );
                break;
            }
        }
        console.log('Done');
    });
});
