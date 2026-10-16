'use strict';

const { ref } = require( 'vue' );

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js',
	() => ( { checkPagesExist: jest.fn() } )
);

const { checkPagesExist } = require(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js'
);
const { useArticleExist, checkTitlesExist, clearExistenceCache } = require(
	'../../../resources/ext.articleguidance.newarticle/composables/useArticleExist.js'
);

describe( 'useArticleExist', () => {
	beforeEach( () => {
		checkPagesExist.mockReset();
		clearExistenceCache();
	} );

	it( 'sets exists from the existence map', async () => {
		checkPagesExist.mockResolvedValue( { 'Some Article': true } );
		const { exists, checkExistence } = useArticleExist( ref( 'Some Article' ) );

		await checkExistence();

		expect( exists.value ).toBe( true );
	} );

	it( 'does not check a whitespace-only title', async () => {
		const { exists, checkExistence } = useArticleExist( ref( '   ' ) );

		await checkExistence();

		expect( checkPagesExist ).not.toHaveBeenCalled();
		expect( exists.value ).toBe( null );
	} );

	it( 'reuses the existence of a title checked before, until the cache is cleared', async () => {
		checkPagesExist.mockResolvedValue( { 'Some Article': false } );
		await useArticleExist( ref( 'Some Article' ) ).checkExistence();

		const { exists, loading, checkExistence } = useArticleExist( ref( 'Some Article' ) );
		await checkExistence();

		expect( checkPagesExist ).toHaveBeenCalledTimes( 1 );
		expect( exists.value ).toBe( false );
		expect( loading.value ).toBe( false );

		clearExistenceCache();
		await checkExistence();

		expect( checkPagesExist ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'does not cache a failed check', async () => {
		checkPagesExist.mockRejectedValue( new Error( 'API error' ) );
		const { exists, error, checkExistence } = useArticleExist( ref( 'Some Article' ) );
		await checkExistence();

		checkPagesExist.mockResolvedValue( { 'Some Article': true } );
		await checkExistence();

		expect( error.value ).toBe( null );
		expect( exists.value ).toBe( true );
	} );
} );

describe( 'checkTitlesExist', () => {
	beforeEach( () => {
		checkPagesExist.mockReset();
		clearExistenceCache();
	} );

	it( 'checks all titles in one request', async () => {
		checkPagesExist.mockResolvedValue( { Paris: true } );

		const existenceMap = await checkTitlesExist( [ 'Paris', 'Paris, Texas' ] );

		expect( checkPagesExist ).toHaveBeenCalledTimes( 1 );
		expect( checkPagesExist ).toHaveBeenCalledWith( [ 'Paris', 'Paris, Texas' ] );
		expect( existenceMap ).toEqual( { Paris: true, 'Paris, Texas': false } );
	} );

	it( 'requests only the titles that are not in the cache', async () => {
		checkPagesExist.mockResolvedValue( { Paris: true } );
		await useArticleExist( ref( 'Paris' ) ).checkExistence();
		checkPagesExist.mockResolvedValue( {} );

		const existenceMap = await checkTitlesExist( [ 'Paris', 'Paris, Texas' ] );

		expect( checkPagesExist ).toHaveBeenLastCalledWith( [ 'Paris, Texas' ] );
		expect( existenceMap ).toEqual( { Paris: true, 'Paris, Texas': false } );
	} );

	it( 'sends no request when all titles are in the cache', async () => {
		checkPagesExist.mockResolvedValue( { Paris: true } );
		await checkTitlesExist( [ 'Paris' ] );

		const existenceMap = await checkTitlesExist( [ 'Paris' ] );

		expect( checkPagesExist ).toHaveBeenCalledTimes( 1 );
		expect( existenceMap ).toEqual( { Paris: true } );
	} );

	it( 'does not cache a failed check', async () => {
		checkPagesExist.mockRejectedValue( new Error( 'API error' ) );
		await expect( checkTitlesExist( [ 'Paris' ] ) ).rejects.toThrow( 'API error' );

		checkPagesExist.mockResolvedValue( { Paris: true } );

		expect( await checkTitlesExist( [ 'Paris' ] ) ).toEqual( { Paris: true } );
	} );
} );
