'use strict';

const { ref, nextTick, effectScope } = require( 'vue' );

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
	'../../../resources/ext.articleguidance.newarticle/api/Cx.js',
	() => ( { translateQuery: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/utils/commonsThumb.js',
	() => ( { getCommonsThumbUrl: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/logging/instrument.js',
	() => ( { logSearchStart: jest.fn(), logSearchEnd: jest.fn() } )
);

const { searchWikidata, fetchEntityClaims } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Wikidata.js'
);
const instrument = require(
	'../../../resources/ext.articleguidance.newarticle/logging/instrument.js'
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
		instrument.logSearchStart.mockReset();
		instrument.logSearchEnd.mockReset();
		let searchCount = 0;
		global.mw.user = { generateRandomSessionId: () => 'search' + ( ++searchCount ) };
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

	describe( 'instrumentation', () => {
		it( 'logs search_start and search_end with the searched query', async () => {
			const query = ref( '' );
			useWikidataSearch( query, ref( 'en' ) );

			query.value = 'Tiger Woods';
			await nextTick();
			expect( instrument.logSearchStart ).not.toHaveBeenCalled();

			jest.advanceTimersByTime( 300 );
			await flushPromises();

			expect( instrument.logSearchStart ).toHaveBeenCalledWith(
				'search1', 'Tiger Woods', 'input'
			);
			expect( instrument.logSearchEnd ).toHaveBeenCalledWith(
				'search1', 'Tiger Woods', 'results', expect.any( Number ), 1, 'wikidata_direct'
			);
		} );

		it( 'logs the trigger that performSearch receives', async () => {
			const { performSearch } = useWikidataSearch( ref( '' ), ref( 'en' ) );

			await performSearch( 'Tiger Woods', 'mount' );

			expect( instrument.logSearchStart ).toHaveBeenCalledWith(
				'search1', 'Tiger Woods', 'mount'
			);
		} );

		it( 'logs no_results when no result is shown', async () => {
			searchWikidata.mockResolvedValue( [] );
			const { performSearch } = useWikidataSearch( ref( '' ), ref( 'en' ) );

			await performSearch( 'Xyzzy' );

			expect( instrument.logSearchEnd ).toHaveBeenCalledWith(
				'search1', 'Xyzzy', 'no_results', expect.any( Number ), 0, 'mint_fallback_no_results'
			);
		} );

		it( 'logs error when the search fails', async () => {
			searchWikidata.mockRejectedValue( new Error( 'network' ) );
			const { performSearch } = useWikidataSearch( ref( '' ), ref( 'en' ) );

			const search = performSearch( 'Tiger Woods' );
			await flushPromises();
			jest.runAllTimers();
			await search;

			expect( instrument.logSearchEnd ).toHaveBeenCalledWith(
				'search1', 'Tiger Woods', 'error', expect.any( Number ), null, null
			);
		} );

		it( 'logs replaced when the query changes during a search', async () => {
			const query = ref( '' );
			searchWikidata.mockReturnValueOnce( new Promise( () => {} ) );
			useWikidataSearch( query, ref( 'en' ) );

			query.value = 'Tiger W';
			await nextTick();
			jest.advanceTimersByTime( 300 );
			await flushPromises();
			query.value = 'Tiger Woods';
			await nextTick();

			expect( instrument.logSearchEnd ).toHaveBeenCalledTimes( 1 );
			expect( instrument.logSearchEnd ).toHaveBeenCalledWith(
				'search1', 'Tiger W', 'replaced', expect.any( Number ), null, null
			);

			jest.advanceTimersByTime( 300 );
			await flushPromises();

			expect( instrument.logSearchEnd ).toHaveBeenLastCalledWith(
				'search2', 'Tiger Woods', 'results', expect.any( Number ), 1, 'wikidata_direct'
			);
		} );

		it( 'logs cancelled when the query is cleared during a search', async () => {
			const query = ref( '' );
			searchWikidata.mockReturnValueOnce( new Promise( () => {} ) );
			useWikidataSearch( query, ref( 'en' ) );

			query.value = 'Tiger';
			await nextTick();
			jest.advanceTimersByTime( 300 );
			await flushPromises();
			query.value = '';
			await nextTick();

			expect( instrument.logSearchEnd ).toHaveBeenCalledWith(
				'search1', 'Tiger', 'cancelled', expect.any( Number ), null, null
			);
		} );

		it( 'does not start a pending search after the search step closes', async () => {
			const query = ref( '' );
			const scope = effectScope();
			scope.run( () => useWikidataSearch( query, ref( 'en' ) ) );

			query.value = 'Tiger Woods';
			await nextTick();
			scope.stop();
			jest.advanceTimersByTime( 300 );
			await flushPromises();

			expect( searchWikidata ).not.toHaveBeenCalled();
			expect( instrument.logSearchStart ).not.toHaveBeenCalled();
		} );

		it( 'logs no search_end for a search running when the search step closes', async () => {
			const query = ref( '' );
			let resolveSearch;
			searchWikidata.mockReturnValueOnce( new Promise( ( resolve ) => {
				resolveSearch = resolve;
			} ) );
			const scope = effectScope();
			const { results } = scope.run( () => useWikidataSearch( query, ref( 'en' ) ) );

			query.value = 'Tiger Woods';
			await nextTick();
			jest.advanceTimersByTime( 300 );
			await flushPromises();
			scope.stop();
			resolveSearch( [ { id: 'Q10993', url: '' } ] );
			await flushPromises();

			expect( instrument.logSearchStart ).toHaveBeenCalledTimes( 1 );
			expect( instrument.logSearchEnd ).not.toHaveBeenCalled();
			expect( results.value ).toEqual( [] );
		} );

		it( 'logs nothing when the query changes after a search ends', async () => {
			const { performSearch } = useWikidataSearch( ref( '' ), ref( 'en' ) );
			await performSearch( 'Tiger Woods' );
			instrument.logSearchEnd.mockReset();

			await performSearch( '' );

			expect( instrument.logSearchEnd ).not.toHaveBeenCalled();
		} );
	} );
} );
