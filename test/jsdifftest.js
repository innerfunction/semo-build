var person1 = {
    firstName: "John",
    lastName: "Doe",
    age: 32,
    eyeColor: "blue",
    family:  {
        mother: {
            name: "Claire",
            age: 57,
            working: true,
            eyeColor: "blue"
        },
        father: {
           name: "Steven",
           age: 60,
           working: false,
           eyeColor: "brown"
        }
    }
};

var person2 = {
    firstName: "Jane",
    lastName: "Doe",
    age: 30,
    eyeColor: "blue",
    family:  {
        mother: {
            name: "Claire",
            age: 57,
            working: true,
            eyeColor: "blue"
        },
        father: {
           name: "Steven",
           age: 60,
           working: true,
           eyeColor: "brown"
        },
        sister: {
            name: "Anne",
            age: 28,
            working: true,
            eyeColor: "blue"
        }
    }
};

var utils = require('../lib/utils');
var diff = utils.jsdiff( person1, person2 );
console.log( JSON.stringify( diff, null, 4 ) );
