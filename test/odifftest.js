var fs = require('fs');
var b1 = JSON.parse( fs.readFileSync('build1.js').toString() );
var b2 = JSON.parse( fs.readFileSync('build3.js').toString() );
var odiff = require('../lib/odiff');
function eq( o1, o2 ) {
    return o1.sum == o2.sum && o1.size == o2.size;
}
console.log(odiff( b1.files, b2.files, eq ));
