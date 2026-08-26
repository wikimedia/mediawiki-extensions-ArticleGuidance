'use strict';

const MODULE = '../../../resources/ext.articleguidance.newarticle/api/Redirect.js';

const CONFIG = {
	wgArticleGuidanceRedirectWord: '#REDIRECT',
	wgUserLanguage: 'en'
};

/**
 * Install an mw stub whose postWithToken resolves with the given result.
 *
 * @param {Object} config Overrides for the mw.config values the module reads
 * @return {Function} The postWithToken mock
 */
function mockMw( config = {} ) {
	const values = Object.assign( {}, CONFIG, config );
	const postWithToken = jest.fn().mockResolvedValue( { edit: { result: 'Success' } } );

	global.mw = {
		config: { get: ( key ) => values[ key ] },
		Api: jest.fn().mockImplementation( () => ( { postWithToken } ) )
	};
	return postWithToken;
}

describe( 'createRedirect', () => {
	let createRedirect;

	beforeEach( () => {
		jest.resetModules();
		( { createRedirect } = require( MODULE ) );
	} );

	it( 'edits the source title into a redirect, marked as Article Guidance', () => {
		const postWithToken = mockMw();

		createRedirect( 'NYC', 'New York City' );

		expect( postWithToken ).toHaveBeenCalledWith( 'csrf', expect.objectContaining( {
			action: 'edit',
			title: 'NYC',
			text: '#REDIRECT [[New York City]]',
			articleguidance: 1
		} ) );
	} );

	it( 'sends no summary, leaving MediaWiki to supply its own', () => {
		// A summary composed client-side would be in the user's interface
		// language; MediaWiki's autoredircomment is in the wiki's content language.
		const postWithToken = mockMw();

		createRedirect( 'NYC', 'New York City' );

		expect( postWithToken.mock.calls[ 0 ][ 1 ] ).not.toHaveProperty( 'summary' );
	} );

	it( 'makes the write conditional on the title still being free', () => {
		const postWithToken = mockMw();

		createRedirect( 'NYC', 'New York City' );

		expect( postWithToken.mock.calls[ 0 ][ 1 ].createonly ).toBe( 1 );
	} );

	it( 'uses the wiki\'s own redirect keyword', () => {
		// frwiki writes #REDIRECTION; the keyword is localised per content language.
		const postWithToken = mockMw( { wgArticleGuidanceRedirectWord: '#REDIRECTION' } );

		createRedirect( 'NYC', 'New York City' );

		expect( postWithToken.mock.calls[ 0 ][ 1 ].text )
			.toBe( '#REDIRECTION [[New York City]]' );
	} );

	it( 'asks for errors in the user\'s interface language', () => {
		const postWithToken = mockMw( { wgUserLanguage: 'pt-br' } );

		createRedirect( 'NYC', 'New York City' );

		expect( postWithToken.mock.calls[ 0 ][ 1 ].errorlang ).toBe( 'pt-br' );
	} );

	it( 'surfaces the Action API error code', async () => {
		mockMw();
		global.mw.Api = jest.fn().mockImplementation( () => ( {
			postWithToken: jest.fn().mockRejectedValue( 'articleexists' )
		} ) );

		await expect( createRedirect( 'NYC', 'New York City' ) )
			.rejects.toBe( 'articleexists' );
	} );
} );
