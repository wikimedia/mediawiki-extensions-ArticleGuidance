'use strict';

const mockCxConfig = {
	ArticleGuidanceCxServerUrl: 'https://cxserver.wikimedia.org/v1/mt',
	ArticleGuidanceCxTargetLanguage: 'en'
};

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/config.json',
	() => mockCxConfig,
	{ virtual: true }
);

const { translateQuery } = require( '../../../resources/ext.articleguidance.newarticle/api/Cx.js' );

const CX_SERVER_URL = 'https://cxserver.wikimedia.org/v1/mt';

function setCxConfig( { serverUrl = CX_SERVER_URL, target = 'en' } = {} ) {
	mockCxConfig.ArticleGuidanceCxServerUrl = serverUrl;
	mockCxConfig.ArticleGuidanceCxTargetLanguage = target;
}

function mockAjax( data ) {
	global.$ = { ajax: jest.fn().mockResolvedValue( data ) };
}

function mockAjaxReject() {
	global.$ = { ajax: jest.fn().mockRejectedValue( new Error( 'ajax error' ) ) };
}

describe( 'translateQuery', () => {
	beforeEach( () => {
		setCxConfig();
	} );

	it( 'returns the translated text on success', async () => {
		mockAjax( { html: '<p>Omar Abdulkadir Artan</p>' } );

		const result = await translateQuery( 'ওমর আব্দুলকাদির আর্তান', 'bn' );

		expect( result ).toBe( 'Omar Abdulkadir Artan' );
	} );

	it( 'posts the query to the language-pair endpoint with the cxserver payload', async () => {
		mockAjax( { html: '<p>Mahatma Gandhi</p>' } );

		await translateQuery( 'महात्मा गांधी', 'hi' );

		expect( global.$.ajax ).toHaveBeenCalledWith(
			expect.objectContaining( {
				url: 'https://cxserver.wikimedia.org/v1/mt/hi/en/MinT',
				method: 'POST',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify( {
					html: '<p>महात्मा गांधी</p>'
				} )
			} )
		);
	} );

	it( 'escapes HTML-special characters in the query', async () => {
		mockAjax( { html: '<p>A &amp; B</p>' } );

		await translateQuery( 'A & B <x>', 'hi' );

		expect( JSON.parse( global.$.ajax.mock.calls[ 0 ][ 0 ].data ).html )
			.toBe( '<p>A &amp; B &lt;x&gt;</p>' );
	} );

	it( 'strips tags and decodes entities from the response', async () => {
		mockAjax( { html: '<p>Tom &amp; Jerry</p>' } );

		expect( await translateQuery( 'टॉम एंड जेरी', 'hi' ) ).toBe( 'Tom & Jerry' );
	} );

	it( 'trims the input before translating', async () => {
		mockAjax( { html: '<p>Fairuz</p>' } );

		await translateQuery( '  فيروز  ', 'ar' );

		expect( JSON.parse( global.$.ajax.mock.calls[ 0 ][ 0 ].data ).html ).toBe( '<p>فيروز</p>' );
	} );

	it( 'returns null when the translation is empty', async () => {
		mockAjax( { html: '<p></p>' } );

		expect( await translateQuery( 'महात्मा गांधी', 'hi' ) ).toBeNull();
	} );

	it( 'returns null when the response has no html field', async () => {
		mockAjax( {} );

		expect( await translateQuery( 'महात्मा गांधी', 'hi' ) ).toBeNull();
	} );

	it( 'returns null when the request fails (HTTP error, network error, or timeout)', async () => {
		mockAjaxReject();

		expect( await translateQuery( 'महात्मा गांधी', 'hi' ) ).toBeNull();
	} );

	it( 'returns null without calling the API when source equals target', async () => {
		mockAjax( { html: '<p>x</p>' } );

		expect( await translateQuery( 'hello', 'en' ) ).toBeNull();
		expect( global.$.ajax ).not.toHaveBeenCalled();
	} );

	it( 'returns null without calling the API when the server URL is not configured', async () => {
		setCxConfig( { serverUrl: null } );
		mockAjax( { html: '<p>x</p>' } );

		expect( await translateQuery( 'महात्मा गांधी', 'hi' ) ).toBeNull();
		expect( global.$.ajax ).not.toHaveBeenCalled();
	} );

	it( 'returns null for empty or missing input', async () => {
		mockAjax( { html: '<p>x</p>' } );

		expect( await translateQuery( '', 'hi' ) ).toBeNull();
		expect( await translateQuery( '   ', 'hi' ) ).toBeNull();
		expect( await translateQuery( 'महात्मा', '' ) ).toBeNull();
		expect( global.$.ajax ).not.toHaveBeenCalled();
	} );

	it( 'falls back to the configured target language when none is passed', async () => {
		setCxConfig( { target: 'fr' } );
		mockAjax( { html: '<p>Gandhi</p>' } );

		await translateQuery( 'महात्मा गांधी', 'hi' );

		expect( global.$.ajax.mock.calls[ 0 ][ 0 ].url )
			.toBe( 'https://cxserver.wikimedia.org/v1/mt/hi/fr/MinT' );
	} );
} );
