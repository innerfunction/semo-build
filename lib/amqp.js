var Log = require('log4js').getLogger('semo-build/amqp');
var q = require('semo/lib/q');
var amqplib = require('amqplib');
var format = require('util').format;

// Filter AMQP messages by post status. This is to avoid downloading posts for
// intermediate WP states.
// TODO: Allow the feed to override this.
function postStatusFilter( message ) {
    return message.status == 'publish' || message.status == 'trash';
}

function AMQPClient() {
    this.feedChannels = {};
    // Queue of feeds waiting for a connection to be established.
    this.queuedFeeds = [];
}

AMQPClient.prototype.start = function( config, components ) {
    var client = this;
    client.downloader = components.download;
    client.builder = components.build;

    var mode = config.get('build.amqp.mode','test');
    Log.info('Queue mode: %s', mode );
    this.queueNameSuffix = mode == 'live' ? 'ep' : 'ep_test';
    Log.info('Queue name suffix: %s', this.queueNameSuffix );

    var url = config.get('build.amqp.url');
    amqplib.connect( url )
    .then(function setConnection( connection ) {
        client.connection = connection;
        // Add any queued feeds.
        client.queuedFeeds.forEach(function addFeed( feed ) {
            client.addFeed( feed );
        });
        client.queuedFeeds = [];
    },
    function error( err ) {
        Log.error('Failed to connect to AMQP server at %s', url, err );
    });
}

AMQPClient.prototype.addFeed = function( feed ) {
    // If no connection yet then just queue the feed.
    if( !this.connection ) {
        this.queuedFeeds.push( feed );
        return;
    }
    var downloader = this.downloader;
    var builder = this.builder;
    var feedChannels = this.feedChannels;
    // Generate queue name.
    var queueName = format('%s_updates_%s', this.queueNameSuffix, feed.queue );
    Log.info('Connecting to queue %s...', queueName );
    // Check if a channel is already open for this feed; if so, then skip.
    // (This may happen if the feed is reloaded).
    if( feedChannels[feed.id] ) return;
    // Otherwise continue with opening the channel.
    this.connection.createChannel()
    .then(function consumeQueue( ch ) {
        // Register the channel.
        feedChannels[feed.id] = ch;
        // Connect to queue and start processing messages.
        ch.assertQueue( queueName );
        ch.consume( queueName, function consume( message ) {
            var content = JSON.parse( message.content.toString() );
            if( postStatusFilter( content ) ) {
                downloader.downloadFeed( feed, content.url )
                .then(function build( dirty ) {
                    if( dirty ) {
                        return builder.addToBuildQueue( feed );
                    }
                    else {
                        return q.Q();
                    }
                })
                .then(function ack() {
                    // Acknowledge receiving the message once processed.
                    ch.ack( message );
                })
                .fail(function error( e ) {
                    Log.error('Failed to process post %s for feed %s', content.url, feed.id, e );
                });
            }
            else {
                // Acknowledge receiving unhandled message.
                ch.ack( message );
            }
        });
    },
    function error( err ) {
        Log.error('Failed to open channel', err );
    });
}

exports.create = function() {
    return new AMQPClient();
}
