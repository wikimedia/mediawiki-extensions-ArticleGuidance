'use strict';

const CITOID_SERVICE_URL = 'http://localhost:1970';

function mockFetch( data, ok = true ) {
	return jest.fn().mockResolvedValue( {
		ok,
		json: jest.fn().mockResolvedValue( data )
	} );
}

/**
 * @param {string|false} citoidServiceUrl Citoid service URL, or false for "not configured"
 * @param {string|null} typeMapJson Value returned by the type-map message
 * @param {Object} apiResponse templatedata API response (default: no maps)
 */
function mockMw(
	citoidServiceUrl = CITOID_SERVICE_URL,
	typeMapJson = null,
	apiResponse = { pages: {} }
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
			get: jest.fn().mockResolvedValue( apiResponse )
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
		const customMap = { webpage: 'cite web', journalArticle: 'cite journal' };
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

describe( 'fetchAllCitationsWikitext', () => {
	let fetchAllCitationsWikitext;

	beforeEach( () => {
		mockMw();
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
	} );

	it( 'falls back to English parameter names when templates expose no maps.citoid', async () => {
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { webpage: 'Cite web' } ) );
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
		global.fetch = jest.fn()
			.mockResolvedValueOnce( { ok: true, json: () => Promise.resolve( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] ) } )
			.mockResolvedValueOnce( { ok: true, json: () => Promise.resolve( [ { itemType: 'webpage', url: 'https://b.com', title: 'B' } ] ) } );

		const result = await fetchAllCitationsWikitext( [ 'https://a.com', 'https://b.com' ] );

		expect( result ).toEqual( [
			'{{Cite web|url=https://a.com|title=A}}',
			'{{Cite web|url=https://b.com|title=B}}'
		] );
	} );

	it( 'returns null entries when no type map is available (Citoid configured but message missing)', async () => {
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		const result = await fetchAllCitationsWikitext( [ 'https://a.com' ] );

		expect( result ).toEqual( [ null ] );
	} );

	it( 'localises template and parameter names from the type map + maps.citoid', async () => {
		mockMw(
			CITOID_SERVICE_URL,
			JSON.stringify( { webpage: 'Lien web' } ),
			{ pages: { 1: { title: 'Template:Lien web', maps: { citoid: { url: 'url', title: 'titre' } } } } }
		);
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://example.fr', title: 'Bonjour' } ] );

		const result = await fetchAllCitationsWikitext( [ 'https://example.fr' ] );

		expect( result ).toEqual( [ '{{Lien web|url=https://example.fr|titre=Bonjour}}' ] );
	} );

	it( 'returns null for a failed URL while succeeding for others', async () => {
		mockMw( CITOID_SERVICE_URL, JSON.stringify( { webpage: 'Cite web' } ) );
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
		global.fetch = jest.fn()
			.mockResolvedValueOnce( { ok: true, json: () => Promise.resolve( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] ) } )
			.mockRejectedValueOnce( new Error( 'Network error' ) );

		const result = await fetchAllCitationsWikitext( [ 'https://a.com', 'https://b.com' ] );

		expect( result[ 0 ] ).toBe( '{{Cite web|url=https://a.com|title=A}}' );
		expect( result[ 1 ] ).toBeNull();
	} );

	it( 'resolves the type map only once regardless of URL count', async () => {
		const messageSpy = jest.fn().mockReturnValue( { plain: () => 'no-leading-brace' } );
		global.mw.message = messageSpy;
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );
		global.fetch = mockFetch( [ { itemType: 'webpage', url: 'https://a.com', title: 'A' } ] );

		await fetchAllCitationsWikitext( [ 'https://a.com', 'https://b.com', 'https://c.com' ] );

		expect( messageSpy ).toHaveBeenCalledTimes( 1 );
		expect( messageSpy ).toHaveBeenCalledWith( 'citoid-template-type-map.json' );
	} );

	it( 'returns an empty array for an empty input', async () => {
		const result = await fetchAllCitationsWikitext( [] );

		expect( result ).toEqual( [] );
	} );

	it( 'returns null entries when Citoid is not configured', async () => {
		mockMw( false );
		jest.resetModules();
		( { fetchAllCitationsWikitext } = require( '../../../resources/ext.articleguidance.newarticle/api/Citoid.js' ) );

		const result = await fetchAllCitationsWikitext( [ 'https://example.com' ] );

		expect( result ).toEqual( [ null ] );
	} );
} );
