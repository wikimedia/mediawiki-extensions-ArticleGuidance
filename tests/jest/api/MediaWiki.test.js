'use strict';

const MODULE = '../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js';

/**
 * Install an mw stub whose Api.get resolves with the given query response.
 *
 * @param {Object} query The `query` part of the API response
 * @return {Function} The get mock
 */
function mockApi( query ) {
	const get = jest.fn().mockResolvedValue( { query } );
	global.mw.Api = jest.fn().mockImplementation( () => ( { get } ) );
	return get;
}

describe( 'checkPagesExist', () => {
	let checkPagesExist;

	beforeEach( () => {
		jest.resetModules();
		( { checkPagesExist } = require( MODULE ) );
	} );

	it( 'sends trimmed titles and keys the result by the input titles', async () => {
		const get = mockApi( {
			normalized: [ { from: 'Paris  (City)', to: 'Paris (City)' } ],
			pages: [
				{ title: 'Paris' },
				{ title: 'Paris (City)' },
				{ title: 'Lyon', missing: true }
			]
		} );

		const result = await checkPagesExist( [ ' Paris ', ' Paris  (City)', 'Lyon' ] );

		expect( get ).toHaveBeenCalledWith( expect.objectContaining( {
			titles: 'Paris|Paris  (City)|Lyon'
		} ) );
		expect( result ).toEqual( {
			' Paris ': true,
			' Paris  (City)': true,
			Lyon: false
		} );
	} );

	it( 'does not call the API for whitespace-only titles', async () => {
		const get = mockApi( { pages: [] } );

		const result = await checkPagesExist( [ '  ', '' ] );

		expect( get ).not.toHaveBeenCalled();
		expect( result ).toEqual( {} );
	} );
} );
