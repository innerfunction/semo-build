require('../lib/cx')
.run('input','output', function( cx ) {
    var img = cx.image('home-banner.png').write();
    var data = {
        title: 'The Test',
        banner: img.get('home-banner.png')
    }
    cx.eval('template.html', data ).write('result.html');
});
