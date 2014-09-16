var Log = require('log4js').getLogger('semo-build/feeds');
var q = require('semo/lib/q');
var inherits = require('util').inherits;
var format = require('util').format;
var http = require('./http');
var dformat = require('dateformat');

AsyncData.prototype.toJSON = function() {
    return this.data;
}
function AsyncData()

Context.prototype.get = function() {
    var url = format.apply( this, arguments );
    var feed = new Feed( this, url );
    this.add2q(function() {
        return http.get( url )
        .then(function( data ) {
            feed.data = data;
            // TODO: Need to record last download date.
            // TODO: Incorporate HEAD requests somehow?
        });
    });
    return feed;
}
Context.prototype.lastDownload = function( format ) {
    return dformat( this._record.$lastDownload, format||'isoDateTime' );
}
Context.prototype.record = function( data ) {
    var record = this._record;
    this.add2q(function() {
        for( var id in data ) {
            record[id] = data[id];
        }
        // TODO write to db
    });
    return this;
}
Context.prototype.write = function( posts ) {
    var record = this._record;
    this.add2q(function() {
        posts._data.forEach(function( post ) {
            post.$feedID = record.$feedID;
        });
        // TODO: write posts to db
    });
    return this;
}
Context.prototype.clean = function( fn ) {
    this.add2db(function() {
        // read all feed related posts from db (requires a feedID property)
        // pass through filter function
        // delete non-matching posts
    });
    return this;
}
AsyncData.prototype.add2q = function( fn ) {
    this._opq.push( fn );
}
Context.prototype.commit = function() {
    var cx = this;
    // Commit all operations on an op queue.
    function commit( opq ) {
        opq = opq.map(function( op ) {
            // The operation may itself contain calls to methods which will add new
            // async ops to the ops queue. We want these to appear to execute 'in
            // sequence' - that is, before any other async ops that are defined later
            // in the synchronous procedure - so they can't be added to the end of the
            // master op queue. Instead...
            var _opq = [];              // ... create a new op queue...
            cx._opq = [];               // ... assign to cx so that it's accessible
            return op()                 // within the op function...
            .then(function() {
                return commit( _opq );  // ... and then commit the ops on the new queue
            });                         // as soon as the operation has completed.

            // Note that this will create a recursive structure of nested op queues;
            // recursion stops once a function generates an empty op queue.
            // Note also that there's no need to restore the context's original op queue
            // once we're done.
        });
        return q.seqall( opq );
    }
    return commit( this._opq );
}
function Context( record ) {
    this._opq = [];
    this._record = record;
}

inherits( Post, AsyncData );
Post.prototype.map = function( fn ) {
    var post = this;
    _cx.add2q(function() {
        return q.Q( fn( post.data ) )
        .then(function( data ) {
            post.data = data;
        });
    });
    return this;
}
function Post( cx ) {
    this._cx = cx;
}

inherits( Feed, Post );
Feed.prototype.posts = function( fn ) {
    var feed = this;
    var posts = new Posts( this );
    var err = new Error();
    _cx.add2q(function() {
        return q.Q( fn( feed.data ) )
        .then(function( data ) {
            if( Array.isArray( data ) ) {
                posts.data = data;
            }
            else {
                err.message = 'Posts data must be an array';
                throw err;
            }
        });
    });
    return posts;
}
function Feed( cx, url ) {
    this._cx = cx;
    this._url = url;
}

inherits( Posts, AsyncData );
Posts.prototype.map = function( fn ) {
    var posts = this;
    _cx.add2q(function() {
        posts.data = posts.data.map( fn );
        return q.Q();
    });
    return this;
}
function Posts( feed ) {
    this._cx = feed._cx;
}
