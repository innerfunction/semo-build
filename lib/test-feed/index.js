var mods = {
	df: 	require('dateformat'),
	path:	require('path'),
	tt:		require('semo/lib/tinytemper')
}
var utils = require('semo/eventpac/utils');

exports.active = true;
exports.schedule = '*';
exports.download = function(cx) {

	cx.clean(function(post) {
		return !(post.id && post.id.indexOf('resultsIndividual.') == 0);
	});

	var BaseURL = 'http://onf1.com.mx/api/onf1/%s';
    
	var resultsTeam = cx.get( BaseURL, 'results/groups' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:				'resultsTeam-'+post.id,
			pos:            post.id,
        	title:          post.title,
        	points:         post.points,
        	nationality:    post.nationality,
			type:			'resultsTeam'
		}
    });

	var resultsIndividual = cx.get( BaseURL, 'results/performers' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:				'resultsIndividual-'+post.id,	
			pos:            post.id,
			title:          post.title,
			nationality:    post.nationality,
			team:           post.group[0].title || '',
			teamInitials:	post.group[0].teamInitials,
			points:         post.points,
			type:			'resultsIndividual'
		}
    });
	
	var events = cx.get( BaseURL, 'events' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:         post.id,
			status:     post.status,
            title:      utils.filterHTML( post.title ),
            content:    utils.filterContent( post.content ),
			image:      post.photo,
			circuit:    post.circuit,
			location:   utils.cuval( post.locations ),
			start:      mods.df( post.startDateTime, 'dd/mm/yyyy'),
			end:        mods.df( post.endDateTime, 'dd/mm/yyyy'),
			laps:               post.laps,
			distance:           post.distance,
			longitude:          post.longitude,
			fastestLap:         post.fastestLap,
			fastestLapDriver:   post.fastestLapDriver,
			fastestLapTime:     post.fastestLapTime,
			fastestLapCarYear:  post.fastestLapCarYear,
			individualResults:  post.individualResults,
			teamResults:        post.teamResults,
			turnNumber:			post.turnNumber,
			throttleLapUsePercentaje:	post.throttleLapUsePercentaje,
			importantLaps:		post.importantLaps,
			type:				'events',
		}
    });

	var news = cx.get( BaseURL, 'news' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:         post.id,
			title:      post.title,
			author:     post.author,
			modified:   post.modifiedDateTime,
			created:    post.createdDateTime,
			content:    post.content,
			image:      post.photo,
			type:		'news',
		}
    });

	cx.write(resultsIndividual);
	cx.write(resultsTeam);
	cx.write(events);
	cx.write(news);
    
}
exports.build = function(cx) {

	cx.file([
			'templates/theme/css/bootstrap.min.css',
        	'templates/theme/js/jquery.min.js',
        	'templates/theme/js/bootstrap.min.js',
       		'templates/theme/css/flags16.css',
       		'templates/theme/css/flags32.css',
       		'templates/css/style.css',
       		'templates/theme/css/font-awesome.css',
       		'templates/theme/images',
			'templates/images',
			'templates/about.html',
			'templates/share.html',
			'templates/twitter.html',
			'html/sponsor.html'
		]).cp();

	var types = ['news', 'events', 'resultsIndividual', 'resultsTeam'];
	
	var postsByType = types.reduce(function( posts, type ) {
		posts[type] = cx.data.posts.filter(function( post ) {
			return post.type == type;
		});

		var imageURLs = posts[type].map(function(post) {
			return post.image;	
		})
		.filter(function( url ) {
			return !!url;
		});
		cx.images( imageURLs ).resize({ width: 500}, true).mapTo( posts[type], 'image');
		return posts;
	}, {});

	postsByType['results'] = {resultsIndividual: postsByType.resultsIndividual, resultsTeam: postsByType.resultsTeam};
	var newsFiles = cx.eval('templates/news-detail.html', postsByType.news, 'news-{id}.html');
	cx.eval('templates/event-detail.html', postsByType.events, 'events-{id}.html');
	cx.eval('templates/event-results.html', postsByType.events, 'event-results-{id}.html');
	cx.eval('templates/all-results.html', postsByType.results, 'results.html');

	var updates = [];

	for (var type in postsByType) {	

		if( type == 'results' || type == 'resultsIndividual' || type == 'resultsTeam') continue;
		
		var updatesForType = postsByType[type].map(function( post) {
			var description, action;
			switch (post.type) {
				case 'news':
					description = post.author + ' ' + post.modified;
					var file = newsFiles.get( post.id );
					if( file ) {
						action = file.uri('subs:')
						.then(function( uri ) {
							return 'nav/open+view@view:DefaultWebView+html@'+uri;
						});
					}
					break;
				case 'events':
					description = post.circuit;
					action = 'nav/open+view@view:EventDetail+eventID@'+post.id;
					break;
			}
			var image;
			if( post.image ) {
				//image = post.image.uri('subs:');
				image = post.image.href()
				.then(function( href ) {
					return 'subs:/onf1/'+href;
				});
			}
			return {
				id:				post.id,
				type:			post.type,
				title:			post.title,
				description:	description,
				image:			image,
				action:			action,
				startTime:		post.start,
				endTime:		post.end,
			}
		});
		updates = updates.concat( updatesForType );
	}
	var manifest = {
		db: {
			updates: {
				posts: updates
			}
		}
	}
	cx.json( manifest, 'manifest.json', 4);

}
exports.inPath = require('path').dirname(module.filename);
