'use strict';

// config.json is a virtual ResourceLoader module (not on disk), so provide it here.
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/config.json',
	() => ( {
		ArticleGuidanceWikidataUrls: {
			api: 'https://www.wikidata.org/w/api.php',
			view: 'https://www.wikidata.org/wiki/$1',
			sparql: 'https://query.wikidata.org/sparql'
		}
	} ),
	{ virtual: true }
);

function mockFetch( data, ok = true ) {
	return jest.fn().mockResolvedValue( {
		ok,
		json: jest.fn().mockResolvedValue( data )
	} );
}

function mockMw() {
	global.mw = Object.assign( {}, global.mw, {
		config: {
			get: ( key ) => ( key === 'wgDBname' ? 'testwiki' : null )
		},
		log: { warn: jest.fn() }
	} );
}

/**
 * Mock mw.Api().get() for getPageNamespaces, keyed by title → namespace ID.
 *
 * @param {Object} namespaceByTitle
 */
function mockPageNamespaces( namespaceByTitle ) {
	const get = jest.fn().mockResolvedValue( {
		query: {
			pages: Object.entries( namespaceByTitle ).map( ( [ title, ns ] ) => ( { title, ns } ) )
		}
	} );
	global.mw.Api = jest.fn().mockImplementation( () => ( { get } ) );
}

describe( 'fetchEntityClaims', () => {
	let fetchEntityClaims;

	beforeEach( () => {
		mockMw();
		jest.resetModules();
		( { fetchEntityClaims } = require( '../../../resources/ext.articleguidance.newarticle/api/Wikidata.js' ) );
	} );

	it( 'sets hasLabel true when a label exists in the requested language', async () => {
		global.fetch = mockFetch( {
			entities: {
				Q42: {
					labels: { en: { language: 'en', value: 'Douglas Adams' } },
					descriptions: { en: { language: 'en', value: 'English author' } },
					claims: {},
					sitelinks: {}
				}
			}
		} );

		const result = await fetchEntityClaims( [ 'Q42' ], [], 'en' );

		expect( result.Q42.hasLabel ).toBe( true );
		expect( result.Q42.label ).toBe( 'Douglas Adams' );
		expect( result.Q42.labelFallback ).toBe( false );
	} );

	it( 'sets hasLabel true and labelFallback true when only a fallback-language label exists', async () => {
		// Requested 'de', but the label resolved through the fallback chain to English.
		global.fetch = mockFetch( {
			entities: {
				Q123: {
					labels: { de: { language: 'en', value: 'Locomotive' } },
					descriptions: {},
					claims: {},
					sitelinks: {}
				}
			}
		} );

		const result = await fetchEntityClaims( [ 'Q123' ], [], 'de' );

		expect( result.Q123.hasLabel ).toBe( true );
		expect( result.Q123.label ).toBe( 'Locomotive' );
		expect( result.Q123.labelFallback ).toBe( true );
	} );

	it( 'sets hasLabel false and falls back to the qid when no label exists in any language', async () => {
		global.fetch = mockFetch( {
			entities: {
				Q999: {
					labels: {},
					descriptions: {},
					claims: {},
					sitelinks: {}
				}
			}
		} );

		const result = await fetchEntityClaims( [ 'Q999' ], [], 'en' );

		expect( result.Q999.hasLabel ).toBe( false );
		expect( result.Q999.label ).toBe( 'Q999' );
	} );

	it( 'skips entities flagged as missing', async () => {
		global.fetch = mockFetch( {
			entities: {
				Q404: { missing: '' }
			}
		} );

		const result = await fetchEntityClaims( [ 'Q404' ], [], 'en' );

		expect( result.Q404 ).toBeUndefined();
	} );

	it( 'keeps labeled and drops unlabeled items within a single mixed request', async () => {
		global.fetch = mockFetch( {
			entities: {
				Q42: {
					labels: { en: { language: 'en', value: 'Douglas Adams' } },
					descriptions: {},
					claims: {},
					sitelinks: {}
				},
				Q999: {
					labels: {},
					descriptions: {},
					claims: {},
					sitelinks: {}
				}
			}
		} );

		const result = await fetchEntityClaims( [ 'Q42', 'Q999' ], [], 'en' );

		expect( result.Q42.hasLabel ).toBe( true );
		expect( result.Q999.hasLabel ).toBe( false );
	} );

	it( 'keeps a local sitelink that points to a main-namespace page', async () => {
		const sitelink = {
			site: 'testwiki',
			title: 'Douglas Adams',
			url: 'https://test.wikipedia.org/wiki/Douglas_Adams'
		};
		global.fetch = mockFetch( {
			entities: {
				Q42: {
					labels: {},
					descriptions: {},
					claims: {},
					sitelinks: { testwiki: sitelink }
				}
			}
		} );
		mockPageNamespaces( { 'Douglas Adams': 0 } );

		const result = await fetchEntityClaims( [ 'Q42' ], [], 'en' );

		expect( result.Q42.localSitelink ).toEqual( sitelink );
		expect( result.Q42.localSitelinkOutsideMainNamespace ).toBe( false );
	} );

	it( 'drops a local sitelink that points outside the main namespace, e.g. a Wikipedia: page', async () => {
		global.fetch = mockFetch( {
			entities: {
				Q42: {
					labels: {},
					descriptions: {},
					claims: {},
					sitelinks: {
						testwiki: {
							site: 'testwiki',
							title: 'Wikipedia:Sandbox',
							url: 'https://test.wikipedia.org/wiki/Wikipedia:Sandbox'
						}
					}
				}
			}
		} );
		// Namespace 4 (Project) here, resolved server-side regardless of query text or language.
		mockPageNamespaces( { 'Wikipedia:Sandbox': 4 } );

		const result = await fetchEntityClaims( [ 'Q42' ], [], 'en' );

		expect( result.Q42.localSitelink ).toBeNull();
		expect( result.Q42.localSitelinkOutsideMainNamespace ).toBe( true );
	} );
} );
