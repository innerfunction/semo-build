require('../lib/cx')
.run('input','output', function( cx ) {
    var fs = cx.file('about.html').cp();
    fs.mv('index.html');
});

