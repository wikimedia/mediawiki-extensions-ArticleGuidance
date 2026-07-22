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
	global.mw = {
		config: {
			get: ( key ) => ( key === 'wgDBname' ? 'testwiki' : null )
		},
		log: { warn: jest.fn() }
	};
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
} );
