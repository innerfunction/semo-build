require('../lib/cx')
.run('input','output', function( cx ) {
    var imgs = cx.images(['home-banner.png','home-title.png']);
    imgs.write();
    cx.images(['home-banner.png','home-title.png']).write('images');
});
