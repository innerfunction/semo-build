var amqplib = require('amqplib');
var url = 'amqp://innerfunction:MOXVLf9nkX8RO4gG@service.eventpac.com:5672';
var name = 'ep_updates_ongp';
var count = 0, timeout;
function notify() { console.log('Ackd %d messages', count ); count = 0; }
amqplib.connect( url )
.then(function( conn ) {
    conn.createChannel()
    .then(function( ch ) {
        ch.assertQueue( name );
        ch.consume( name, function( msg ) {
            ch.ack( msg );
            count++;
            if( timeout ) clearTimeout( timeout );
            timeout = setTimeout( notify, 1 );
        });
    });
});
