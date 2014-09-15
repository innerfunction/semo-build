require('../lib/cx')
.run('input','output', function( cx ) {
    var imgs = cx.images(['home-banner.png','home-title.png']).resize({ width: 100 });
    // Write images to output
    imgs.write();
    // Write images to dir named like 'pngs/xxx.png'
    imgs.write('{format}s/{id}.{format}');
});

