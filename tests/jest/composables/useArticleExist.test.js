'use strict';

const { ref } = require( 'vue' );

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js',
	() => ( { checkPagesExist: jest.fn() } )
);

const { checkPagesExist } = require(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js'
);
const useArticleExist = require(
	'../../../resources/ext.articleguidance.newarticle/composables/useArticleExist.js'
);

describe( 'useArticleExist', () => {
	beforeEach( () => {
		checkPagesExist.mockReset();
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
} );
