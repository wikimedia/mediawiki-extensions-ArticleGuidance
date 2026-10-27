'use strict';

const CITOID_SERVICE_URL = 'http://localhost:1970';
const PARSED_HTML = '<div class="mw-parser-output"><p>A</p></div>';
// templatedata response for a template with a maps.citoid block
const WEB_TEMPLATEDATA = {
	pages: { 1: { title: 'Template:Cite web', maps: { citoid: { url: 'url', title: 'title' } } } }
};

function mockFetch( data, ok = true ) {
	return jest.fn().mockResolvedValue( {
		ok,
		json: jest.fn().mockResolvedValue( data )
	} );
}

/**
 * @param {string|false} citoidServiceUrl Citoid service URL, or false for "not configured"
 * @param {string|null} typeMapJson Value returned by the type-map message
 * @param {Object} apiResponse templatedata API response
 */
function mockMw(
	citoidServiceUrl = CITOID_SERVICE_URL,
	typeMapJson = null,
	apiResponse = WEB_TEMPLATEDATA
) {
	global.mw = Object.assign( {}, global.mw, {
		config: {
			get: ( key ) => {
				if ( key === 'wgCitoidConfig' ) {
					return citoidServiceUrl ? { citoidServiceUrl, fullRestbaseUrl: false } : null;
				}
				if ( key === 'wgContentLanguage' ) {
					return 'en';
				}
				return null;
			}
		},
		message: ( key ) => ( {
			plain: () => ( key === 'citoid-template-type-map.json' && typeMapJson ? typeMapJson : key )
		} ),
		loader: { using: jest.fn().mockResolvedValue( undefined ) },
		Api: jest.fn().mockImplementation( () => ( {
			get: jest.fn().mockResolvedValue( apiResponse ),
			post: jest.fn().mockResolvedValue( { parse: { text: PARSED_HTML } } )
		} ) ),
		Title: jest.fn().mockImplementation( ( name ) => ( {
			getPrefixedText: () => 'Template:' + name
		} ) ),
		log: { warn: jest.fn() }
	} );
}

describe( 'fetchCitation', () => {
	let fetchCitation;

	beforeEach( () => {
		mockMw();
		jest.resetModules();
		( { fetchCitation } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
	} );

	it( 'returns the first element of the Citoid response array', async () => {
		const citation = { itemType: 'webpage', url: 'https://example.com', template: {} };
		global.fetch = mockFetch( [ citation ] );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBe( citation );
		expect( global.fetch ).toHaveBeenCalledWith(
			CITOID_SERVICE_URL + '/mediawiki/' + encodeURIComponent( 'https://example.com' ),
			expect.objectContaining( { headers: { Accept: 'application/json' } } )
		);
	} );

	it( 'returns null when the response array is empty', async () => {
		global.fetch = mockFetch( [] );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when the response is not an array', async () => {
		global.fetch = mockFetch( null );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when fetch throws a network error', async () => {
		global.fetch = jest.fn().mockRejectedValue( new Error( 'Network error' ) );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when the HTTP response is not ok', async () => {
		global.fetch = mockFetch( {}, false );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when wgCitoidConfig is absent', async () => {
		mockMw( false );
		jest.resetModules();
		( { fetchCitation } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		const result = await fetchCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );

	it( 'uses fullRestbaseUrl when set, ignoring citoidServiceUrl', async () => {
		global.mw.config.get = ( key ) => {
			if ( key === 'wgCitoidConfig' ) {
				return {
					fullRestbaseUrl: 'https://en.wikipedia.org/api/rest_',
					citoidServiceUrl: CITOID_SERVICE_URL
				};
			}
			return null;
		};
		jest.resetModules();
		( { fetchCitation } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		const citation = { itemType: 'webpage' };
		global.fetch = mockFetch( [ citation ] );

		await fetchCitation( 'https://example.com' );

		expect( global.fetch ).toHaveBeenCalledWith(
			'https://en.wikipedia.org/api/rest_v1/data/citation/mediawiki/' + encodeURIComponent( 'https://example.com' ),
			expect.anything()
		);
	} );

	it( 'strips a trailing /api from citoidServiceUrl', async () => {
		mockMw( 'http://localhost:1970/api' );
		jest.resetModules();
		( { fetchCitation } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		global.fetch = mockFetch( [ {} ] );

		await fetchCitation( 'https://example.com' );

		expect( global.fetch ).toHaveBeenCalledWith(
			'http://localhost:1970/mediawiki/' + encodeURIComponent( 'https://example.com' ),
			expect.anything()
		);
	} );

	it( 'URL-encodes special characters in the input URL', async () => {
		global.fetch = mockFetch( [ {} ] );
		const url = 'https://example.com/path?q=foo&lang=en';

		await fetchCitation( url );

		expect( global.fetch ).toHaveBeenCalledWith(
			CITOID_SERVICE_URL + '/mediawiki/' + encodeURIComponent( url ),
			expect.anything()
		);
	} );
} );

describe( 'getCitoidTypeMap', () => {
	let getCitoidTypeMap;

	beforeEach( () => {
		jest.resetModules();
	} );

	it( 'loads the Citoid data module and parses the JSON message', async () => {
		const customMap = { _default: 'citation', webpage: 'cite web', journalArticle: 'cite journal' };
		mockMw( CITOID_SERVICE_URL, JSON.stringify( customMap ) );
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( customMap );
		expect( global.mw.loader.using ).toHaveBeenCalledWith( 'ext.citoid.visualEditor.data' );
	} );

	it( 'returns an empty map when the message is missing (no leading {)', async () => {
		mockMw();
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
	} );

	it( 'returns an empty map when a map without _default misses a required type', async () => {
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { webpage: 'Cite web' } ) );
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
		expect( global.mw.log.warn ).toHaveBeenCalled();
	} );

	it( 'returns an empty map when the message is invalid JSON', async () => {
		mockMw( CITOID_SERVICE_URL, '{not valid json' );
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
	} );

	it( 'returns an empty map when mw.message throws', async () => {
		mockMw();
		global.mw.message = () => {
			throw new Error( 'mw not ready' );
		};
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
	} );

	it( 'returns an empty map without loading the module when Citoid is not configured', async () => {
		mockMw( false );
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
		expect( global.mw.loader.using ).not.toHaveBeenCalled();
	} );

	it( 'returns an empty map when the module fails to load', async () => {
		mockMw( CITOID_SERVICE_URL, '{"webpage":"Lien web"}' );
		global.mw.loader.using = jest.fn().mockRejectedValue( new Error( 'load failed' ) );
		( { getCitoidTypeMap } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		await expect( getCitoidTypeMap() ).resolves.toEqual( {} );
	} );
} );

describe( 'fetchFormattedCitation', () => {
	const MODULE = '../../../resources/ext.articleguidance.newarticle/api/Citoid.js';
	let fetchFormattedCitation;

	beforeEach( () => {
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { _default: 'Citation', webpage: 'Cite web' } ) );
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );
	} );

	it( 'returns the wikitext and rendered HTML', async () => {
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toEqual( {
			wikitext: '{{Cite web|url=https://a.com|title=A}}',
			html: PARSED_HTML
		} );
	} );

	it( 'localises template and parameter names from the type map + maps.citoid', async () => {
		mockMw(
			CITOID_SERVICE_URL,
			JSON.stringify( { _default: 'Modèle', webpage: 'Lien web' } ),
			{ pages: { 1: { title: 'Template:Lien web', maps: { citoid: { url: 'url', title: 'titre' } } } } }
		);
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://example.fr', title: 'Bonjour' } ] );

		const result = await fetchFormattedCitation( 'https://example.fr' );

		expect( result.wikitext ).toBe( '{{Lien web|url=https://example.fr|titre=Bonjour}}' );
	} );

	it( 'parses the wikitext with the wiki parser', async () => {
		const post = jest.fn().mockResolvedValue( { parse: { text: PARSED_HTML } } );
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			get: jest.fn().mockResolvedValue( WEB_TEMPLATEDATA ),
			post
		} ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		await fetchFormattedCitation( 'https://a.com' );

		expect( post ).toHaveBeenCalledWith( expect.objectContaining( {
			action: 'parse',
			text: '{{Cite web|url=https://a.com|title=A}}',
			contentmodel: 'wikitext'
		} ) );
	} );

	it( 'makes the links in the rendered HTML open in a new tab', async () => {
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			get: jest.fn().mockResolvedValue( WEB_TEMPLATEDATA ),
			post: jest.fn().mockResolvedValue( { parse: { text: '<a href="https://a.com">A</a>' } } )
		} ) );
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result.html ).toBe( '<a href="https://a.com" target="_blank" rel="noopener noreferrer">A</a>' );
	} );

	it( 'returns a null html when the parse request fails', async () => {
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { _default: 'Citation', webpage: 'Cite web' } ) );
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			get: jest.fn().mockResolvedValue( WEB_TEMPLATEDATA ),
			post: jest.fn().mockRejectedValue( new Error( 'http' ) )
		} ) );
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toEqual( { wikitext: '{{Cite web|url=https://a.com|title=A}}', html: null } );
	} );

	it( 'returns null when the citation cannot be built', async () => {
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );
		jest.resetModules();
		jest.doMock( '../../../resources/ext.articleguidance.newarticle/utils/citation.js', () => ( {
			citationToWikitext: () => {
				throw new Error( 'bad data' );
			}
		} ) );
		( { fetchFormattedCitation } = require( MODULE ) );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toBeNull();
		jest.dontMock( '../../../resources/ext.articleguidance.newarticle/utils/citation.js' );
	} );

	it( 'requests the TemplateData of a template one time for many sources', async () => {
		const get = jest.fn().mockResolvedValue( WEB_TEMPLATEDATA );
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			get,
			post: jest.fn().mockResolvedValue( { parse: { text: PARSED_HTML } } )
		} ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		await fetchFormattedCitation( 'https://a.com' );
		await fetchFormattedCitation( 'https://b.com' );

		expect( get ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'requests the TemplateData again after a failure', async () => {
		const get = jest.fn()
			.mockRejectedValueOnce( new Error( 'http' ) )
			.mockResolvedValue( WEB_TEMPLATEDATA );
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			get,
			post: jest.fn().mockResolvedValue( { parse: { text: PARSED_HTML } } )
		} ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		const first = await fetchFormattedCitation( 'https://a.com' );
		const second = await fetchFormattedCitation( 'https://b.com' );

		expect( first ).toBeNull();
		expect( second.wikitext ).toBe( '{{Cite web|url=https://a.com|title=A}}' );
		expect( get ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'returns null when the template has no maps.citoid', async () => {
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { _default: 'Citation', webpage: 'Cite web' } ), { pages: {} } );
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when no type map is available (Citoid configured but message missing)', async () => {
		mockMw();
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when the Citoid request fails', async () => {
		global.fetch = jest.fn().mockRejectedValue( new Error( 'Network error' ) );

		const result = await fetchFormattedCitation( 'https://a.com' );

		expect( result ).toBeNull();
	} );

	it( 'returns null when Citoid is not configured', async () => {
		mockMw( false );
		jest.resetModules();
		( { fetchFormattedCitation } = require( MODULE ) );

		const result = await fetchFormattedCitation( 'https://example.com' );

		expect( result ).toBeNull();
	} );
} );
