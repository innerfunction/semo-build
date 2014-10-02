exports.active = true;
exports.schedule = '*';
exports.download = function(cx) {
	var BaseURL = 'http://onf1.com.mx/api/onf1/%s';
    
	var performers = cx.get( BaseURL, 'performers' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
        return {
			id:         post.id,
            status:     post.status,
            modified:   post.modified,
            title:      post.title,
            content:    post.content,
            image:      post.photo,
            nationality:post.nationality,
            twitter:    post.twitter,
            website:    post.website
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
            content:    post.content,
            image:      post.photo,
            nationality:post.nationality,
            twitter:    post.twitter,
            website:    post.website
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
            points:         post.points
		}
    });
	
	var events = cx.get( BaseURL, 'events' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
		return {
			id:         post.id,
			type:       post.type,
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
			importantLaps:		post.importantLaps
		}
    });

	var news = cx.get( BaseURL, 'news' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
        return {
		    id:         post.id,
            type:       post.type,
            status:     post.status,
            author:     post.author,
            modified:   post.modifiedDateTime,
            created:    post.createdDateTime,
            url:        post.url,       // The permalink url
            title:      post.title,
            content:    post.content,
            image:      post.photo,
            //attachments:post.attachments,
            website:    post.website        // A custom field to
		}
    });

	var pages = cx.get( BaseURL, 'pages' )
    .posts(function( data ) {
        return data.posts;
    })
    .map(function( post ) {
        return {
	        id:             post.id,
           	type:           post.type,
            modified:       post.modified,
            slug:           post.slug,
            url:            post.url,   // The permalink url
            title:          post.title,
            content:        post.content,
            attachments:    post.attachments
		}
    });	

	cx.write(performers);
/*
    cx.record({
		groups: groups,
		resultsIndividual: resultsIndividual,
		events: events,
		news: news,
		pages: pages
    });
*/

}
exports.build = function() {}
exports.inPath = '';
