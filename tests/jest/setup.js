'use strict';

const configValues = {
	wgArticleGuidanceJuniorEditorThreshold: 10,
	wgArticleGuidanceCrossWikiThreshold: 5,
	wgWikiID: 'testwiki'
};

global.mw = {
	config: {
		get: ( key ) => key in configValues ? configValues[ key ] : null
	},
	log: {
		warn: jest.fn()
	},
	// Renders as "key:param|param" so tests can assert which message was used.
	message: ( key, ...params ) => ( {
		text: () => params.length ? key + ':' + params.join( '|' ) : key
	} ),
	util: {
		getUrl: ( title, params ) => '/wiki/' +
			encodeURIComponent( title.replace( / /g, '_' ) ).replace( /%3A/g, ':' ) +
			'?' + new URLSearchParams( params ).toString()
	}
};
