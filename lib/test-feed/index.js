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
		return !(post.id && post.id.indexOf('performers.') == 0);
	});

	var BaseURL = 'http://onf1.com.mx/api/onf1/%s';
    
	var performers = cx.get( BaseURL, 'performers' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:         post.id,
       	    modified:   post.modified,
       	    title:      post.title,
       		nationality:post.nationality,
			type:	'performers'
       	}
	});

	var groups = cx.get( BaseURL, 'groups' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
				id:         post.id,
       	    	status:     post.status,
            	modified:   post.modified,
            	title:      post.title,
            	nationality:post.nationality,
				type:		'groups'
		}
    });

	var resultsTeam = cx.get( BaseURL, 'results/groups' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:             post.id,            // Is the position
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
			id:             post.id,            // Is the position
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
			modified:   post.modified,
			url:        post.url,    // The permalink url
			title:      post.title,
			content:  	post.content,
			image:      post.photo,
			circuit:    post.circuit,
			location:   post.locations,
			start:      post.startDateTime,
			end:        post.endDateTime,
			modified:   post.modifierDateTime,
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
			status:     post.status,
			author:     post.author,
			modified:   post.modifiedDateTime,
			created:    post.createdDateTime,
			url:        post.url,       // The permalink url
			title:      post.title,
			content:    post.content,
			image:      post.photo,
			//attachments:post.attachments,
			website:    post.website,        // A custom field to
			type:		'news',
		}
    });

	var pages = cx.get( BaseURL, 'pages' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:             post.id,
			modified:       post.modified,
			slug:           post.slug,
			url:            post.url,   // The permalink url
			title:          post.title,
			content:        post.content,
			attachments:    post.attachments,
			type:			'pages',
		}
    });	

	cx.write(performers);
	cx.write(groups);
	cx.write(resultsIndividual);
	cx.write(resultsTeam);
	cx.write(events);
	cx.write(news);
	cx.write(pages);
    
	/*cx.record({
		performers: performers,
		groups: groups,
		resultsIndividual: resultsIndividual,
		events: events,
		news: news,
		pages: pages
    });*/

}
exports.build = function(cx) {

	/* NEWS TEMPLATE */
	var news = cx.data.posts.filter(function( post ) { 
		return post.type == 'news'; 
	});

	var newsImageURLs = news.map(function(n) {
		return n.image;
	});
	var newsImages = cx.images(newsImageURLs);
	// newsImageFiles is returning an empty object : { ids: {} }
	var newsImageFiles = newsImages.write();

	news.map(function(n) {
		n.image = newsImageFiles.get(n.image);
	});
	// .write('news-{id}.html') generate a folder call news-{id}.html with all the news in it but without the .html extension
	cx.eval('templates/news-detail.html', news).write('news-{id}.html');

	
	/* EVENT TEMPLATE */
	var events = cx.data.posts.filter(function( post ) { 
		return post.type == 'events'; 
	});
	
	var eventsImageURLs = events.map(function(e) {
		return e.image;
	});
	var eventsImages = cx.images(eventsImageURLs);
	var eventsImageFiles = eventsImages.write();

	events.map(function(e) {
		e.image = eventsImageFiles.get(e.image);
	});
	cx.eval('templates/event-detail.html', events).write('events-{id}.html');

	/* RESULTS TEMPLATE */

	var resultsIndividual = cx.data.posts.filter(function( post ) { 
		return post.type == 'resultsIndividual'; 
	});
	var resultsTeam = cx.data.posts.filter(function( post ) { 
		return post.type == 'resultsTeam';
	});
	var results = { resultsIndividual: resultsIndividual, resultsTeam: resultsTeam }	

	cx.eval('templates/all-results.html', results).write('results.html');

	//TODO Page template
	//TODO Copy css + js lib into subs generated
}
exports.inPath = require('path').dirname(module.filename);
