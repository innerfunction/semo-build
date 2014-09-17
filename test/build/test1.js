require('./lib/cx')
.run('input','output', function( cx ) {
    cx.file('about.html').cp();
    cx.files(['home-banner.png','home-title.png']).cp();
});
