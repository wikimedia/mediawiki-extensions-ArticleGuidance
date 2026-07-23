'use strict';

const modulePath = '../../../resources/ext.articleguidance.common/outlines.js';

let restGet;

beforeEach( () => {
	restGet = jest.fn();

	global.mw = {
		Rest: jest.fn().mockImplementation( () => ( {
			get: restGet
		} ) )
	};
	jest.resetModules();
} );

describe( 'fetchOutlines', () => {
	it( 'returns the outlines of the REST response', async () => {
		restGet.mockResolvedValue( { outlines: [ { title: 'Project:Article guidance/Actor' } ] } );
		const { fetchOutlines } = require( modulePath );
		expect( await fetchOutlines() ).toEqual( [ { title: 'Project:Article guidance/Actor' } ] );
		expect( restGet ).toHaveBeenCalledWith( '/articleguidance/v1/outlines' );
	} );

	it( 'shares one request between calls', async () => {
		restGet.mockResolvedValue( { outlines: [] } );
		const { fetchOutlines } = require( modulePath );
		await Promise.all( [ fetchOutlines(), fetchOutlines() ] );
		expect( restGet ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'tries again after a failure', async () => {
		restGet.mockRejectedValueOnce( new Error( 'http' ) )
			.mockResolvedValue( { outlines: [] } );
		const { fetchOutlines } = require( modulePath );
		await expect( fetchOutlines() ).rejects.toThrow( 'http' );
		expect( await fetchOutlines() ).toEqual( [] );
	} );
} );
