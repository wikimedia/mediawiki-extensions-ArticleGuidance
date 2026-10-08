'use strict';

const { ref, nextTick } = require( 'vue' );

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/config.json',
	() => ( {} ),
	{ virtual: true }
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Wikidata.js',
	() => ( { searchWikidata: jest.fn(), fetchEntityClaims: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Sparql.js',
	() => ( { checkItemHierarchyMatches: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Cx.js',
	() => ( { translateQuery: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/utils/commonsThumb.js',
	() => ( { getCommonsThumbUrl: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/logging/search.js',
	() => ( { reportSearchEvaluation: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/stores/useArticleGuidanceStore.js',
	() => () => ( { loadOutlines: () => Promise.resolve( [] ) } )
);

const { searchWikidata, fetchEntityClaims } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Wikidata.js'
);
const { checkItemHierarchyMatches } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Sparql.js'
);
const useWikidataSearch = require(
	'../../../resources/ext.articleguidance.newarticle/composables/useWikidataSearch.js'
);

// Let the awaited promises of a search resolve under fake timers
async function flushPromises() {
	for ( let i = 0; i < 50; i++ ) {
		await Promise.resolve();
	}
}

describe( 'useWikidataSearch', () => {
	beforeEach( () => {
		jest.useFakeTimers();
		searchWikidata.mockReset();
		fetchEntityClaims.mockReset();
		checkItemHierarchyMatches.mockReset();
		checkItemHierarchyMatches.mockResolvedValue( {} );
		searchWikidata.mockResolvedValue( [ { id: 'Q10993', url: '' } ] );
		fetchEntityClaims.mockResolvedValue( {
			Q10993: { claims: {}, label: 'Tiger Woods', hasLabel: true, description: '' }
		} );
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'is loading from the first keystroke, not only after the debounce', async () => {
		const query = ref( '' );
		const { loading, results } = useWikidataSearch( query, ref( 'en' ) );

		query.value = 'Tiger Woods';
		await nextTick();

		expect( loading.value ).toBe( true );
		expect( searchWikidata ).not.toHaveBeenCalled();

		jest.advanceTimersByTime( 300 );
		await flushPromises();

		expect( loading.value ).toBe( false );
		expect( results.value.map( ( r ) => r.id ) ).toEqual( [ 'Q10993' ] );
	} );

	it( 'discards a search in progress when the query changes', async () => {
		const query = ref( '' );
		let resolveFirst;
		searchWikidata.mockReturnValueOnce( new Promise( ( resolve ) => {
			resolveFirst = resolve;
		} ) );
		const { loading, results } = useWikidataSearch( query, ref( 'en' ) );

		query.value = 'Tiger W';
		await nextTick();
		jest.advanceTimersByTime( 300 );
		await flushPromises();
		query.value = 'Tiger Woods';
		await nextTick();
		resolveFirst( [ { id: 'Q1', url: '' } ] );
		await flushPromises();

		expect( loading.value ).toBe( true );
		expect( results.value ).toEqual( [] );
	} );

	it( 'stops loading when the query is cleared', async () => {
		const query = ref( '' );
		const { loading } = useWikidataSearch( query, ref( 'en' ) );

		query.value = 'Tiger';
		await nextTick();
		query.value = '';
		await nextTick();

		expect( loading.value ).toBe( false );
	} );
} );
