'use strict';

const configValues = {
	wgArticleGuidanceJuniorEditorThreshold: 10,
	wgArticleGuidanceCrossWikiThreshold: 5,
	wgWikiID: 'testwiki',
	wgLegalTitleChars: ' %!"$&\'()*,\\-.\\/0-9:;=?@A-Z\\\\^_`a-z~\\x80-\\xFF+',
	wgNamespaceIds: {
		user: 2,
		talk: 1,
		special: -1,
		wikipedia: 4
	}
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
	},
	Title: {
		newFromText: ( title ) => {
			if ( !title || /[[\]<>{}]/.test( title ) ) {
				return null;
			}
			const colon = title.indexOf( ':' );
			const prefix = colon !== -1 ? title.slice( 0, colon ).toLowerCase() : '';
			const ns = prefix in configValues.wgNamespaceIds ?
				configValues.wgNamespaceIds[ prefix ] : 0;
			if ( colon !== -1 && !title.slice( colon + 1 ) ) {
				return null;
			}
			return {
				getMain: () => title,
				getPrefixedText: () => title,
				getNamespaceId: () => ns
			};
		}
	}
};
