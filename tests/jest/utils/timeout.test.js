'use strict';

const { withTimeout, TimeoutError } = require( '../../../resources/ext.articleguidance.newarticle/utils/timeout.js' );

describe( 'withTimeout', () => {
	beforeEach( () => {
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'resolves with the value of a promise that settles in time', async () => {
		await expect( withTimeout( Promise.resolve( 'Q5' ), 1000 ) ).resolves.toBe( 'Q5' );
	} );

	it( 'rejects with the error of a promise that rejects in time', async () => {
		const error = new Error( 'SPARQL failed' );
		await expect( withTimeout( Promise.reject( error ), 1000 ) ).rejects.toBe( error );
	} );

	it( 'rejects with a TimeoutError when the promise does not settle in time', async () => {
		const result = withTimeout( new Promise( () => {} ), 1000 );
		jest.advanceTimersByTime( 1000 );
		await expect( result ).rejects.toBeInstanceOf( TimeoutError );
	} );

	it( 'times out at once when no time is left', async () => {
		const result = withTimeout( new Promise( () => {} ), -500 );
		jest.advanceTimersByTime( 0 );
		await expect( result ).rejects.toBeInstanceOf( TimeoutError );
	} );

	it( 'clears its timer when the promise settles in time', async () => {
		await withTimeout( Promise.resolve( null ), 1000 );
		expect( jest.getTimerCount() ).toBe( 0 );
	} );
} );
