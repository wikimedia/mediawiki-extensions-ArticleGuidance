'use strict';

const MODULE = '../../../resources/ext.articleguidance.newarticle/api/Sources.js';
const ENDPOINT = '/articleguidance/v0/source/validate';

/**
 * Install an mw stub whose Rest.get resolves with a validation result.
 *
 * @return {Function} The get mock
 */
function mockMw() {
	const get = jest.fn().mockResolvedValue( {
		domain: 'reuters.com',
		classification: 'recommended',
		title: null
	} );

	global.mw = {
		Rest: jest.fn().mockImplementation( () => ( { get } ) )
	};
	return get;
}

describe( 'validateSource', () => {
	let validateSource;

	beforeEach( () => {
		jest.resetModules();
		( { validateSource } = require( MODULE ) );
	} );

	it( 'sends the outline Q ID', () => {
		const get = mockMw();

		validateSource( 'https://ft.com/x', null, 'Q4830453' );

		expect( get ).toHaveBeenCalledWith( ENDPOINT, {
			url: 'https://ft.com/x',
			outlineQId: 'Q4830453'
		} );
	} );

	// The generic outline is addressed by sentinel because it has no Q ID
	// (T435605). The parameter is only added when truthy, and '*' is truthy, so
	// it reaches the endpoint and its source lists apply.
	it( 'sends the generic outline sentinel', () => {
		const get = mockMw();

		validateSource( 'https://reuters.com/x', null, '*' );

		expect( get ).toHaveBeenCalledWith( ENDPOINT, {
			url: 'https://reuters.com/x',
			outlineQId: '*'
		} );
	} );

	it( 'omits the parameter when no outline is selected', () => {
		const get = mockMw();

		validateSource( 'https://reuters.com/x', null, null );

		expect( get ).toHaveBeenCalledWith( ENDPOINT, { url: 'https://reuters.com/x' } );
	} );
} );
