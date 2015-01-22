var Log = require('log4js').getLogger('semo-build/amqp');
var q = require('semo/lib/q');
var amqplib = require('amqplib');
var format = require('util').format;

function AMQPClient() {
}

AMQPClient.prototype.start = function( config ) {
    var client = this;
    client.components = config.components;
    var url = config.get('amqp.url');
    amqplib.connect( url )
    .then(function setConnection( connection ) {
        client.connection = connection;
    },
    function error( err ) {
        Log.error( format('Connecting to server %s', url ), err );
    });
}

AMQPClient.prototype.addFeed = function( feed ) {
    var downloader = this.components.download;
    this.connection.createChannel()
    .then(function consumeQueue( ch ) {
        ch.assertQueue( feed.amqpQueue );
        ch.consume( feed.amqpQueue, function( message ) {
            downloader.downloadPost( message.url )
            .then(function build( dirty ) {
                if( dirty ) {
                    return build.addToBuildQueue( feed );
                }
                else {
                    return q.Q();
                }
            })
            .fail(function error( e ) {
                Log.error('Processing post %s for feed %s', message.url, feed.id, e );
            });
        });
    },
    function error( err ) {
        Log.error('Creating channel', err );
    });
}

exports.create = function() {
    return new AMQPClient();
}
