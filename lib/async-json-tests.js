var q = require('semo/lib/q');
var json = require('./json-stringify-q');

var o0 = {
    a: 1,
    b: true,
    c: 'abc',
    d: {
        e: 'def'
    },
    f: [ 0, 1, 2 ]
}
json.stringify( o0 )
.then(function( json ) {
    console.log('o0:',json);
});
json.stringify( o0, undefined, 4 )
.then(function( json ) {
    console.log('o0:',json);
});

var o1 = {
    a: 1,
    toJSON: function() {
        return {
            b: 2,
            c: false,
            d: {
                e: 'abc'
            }
        }
    }
}
json.stringify( o1, undefined, 4 )
.then(function( json ) {
    console.log('o1:',json);
});

var o2 = {
    a: 1,
    b: [ 0, 1, 2 ],
    c: {
        toJSON: function() {
            var dp = q.defer();
            setTimeout(function() {
                dp.resolve('resolved via promise');
            }, 10 );
            return dp.promise;
        }
    }
}
json.stringify( o2, undefined, 4 )
.then(function( json ) {
    console.log('o2:',json);
});

