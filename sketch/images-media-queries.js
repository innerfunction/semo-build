function( cx ) {
    var imgs = cx.images('images/')                 // -> Images => [ Image ]
    .mediaset({
        'max-width: 200px': {
            width: 200,
            height: 50
        },
        'min-width: 201px and max-width: 480px': {
            width: 480,
            height: 220
        },
        'min-width: 481px': {
            width: 560,
            height: 440
        }
    })                                              // -> ImageSets => [ ImageSet (Image) ]
    .write('images/');                              // -> ImageSets => [ ImageSet (File) ]
    var imgcss = imgs.css();
}

// ImageSets comes in two categories:
// * (Image) or (Content) - the image data not written to file.
// * (File) - the image data is written to file


<html>
    <head>
    <style type="text/css">{imgs.css}</style>
    </head>
    <body>
    <ul>
    {#imgs}
        <li>{html}</li> <!-- => img[x].html -->
    {/imgs}
    </ul>
    </body>
</html>

