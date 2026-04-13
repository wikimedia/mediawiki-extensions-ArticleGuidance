'use strict';

const { isValidUrl, isDuplicate } = require( '../../../resources/ext.articleguidance.newarticle/utils/sources.js' );

describe( 'isValidUrl', () => {
	it( 'returns true for a valid https URL', () => {
		expect( isValidUrl( 'https://example.com/article' ) ).toBe( true );
	} );

	it( 'returns false for a string without a TLD', () => {
		expect( isValidUrl( 'notaurl' ) ).toBe( false );
	} );

	it( 'prepends https:// when scheme is missing', () => {
		expect( isValidUrl( 'en.wikipedia.org' ) ).toBe( true );
	} );

	it( 'returns true for a Latin IDN domain', () => {
		expect( isValidUrl( 'https://bücher.example' ) ).toBe( true );
	} );

	it( 'returns true for a Greek IDN domain without scheme', () => {
		expect( isValidUrl( 'ουτοπία.δπθ.gr' ) ).toBe( true );
	} );

	it( 'returns true for a Bengali IDN domain without scheme', () => {
		expect( isValidUrl( 'উইকিপিডিয়া.বাংলা' ) ).toBe( true );
	} );
} );

describe( 'isDuplicate', () => {
	it( 'returns true when URL already exists in sources', () => {
		const sources = [ { url: 'https://example.com' } ];
		expect( isDuplicate( 'https://example.com', sources ) ).toBe( true );
	} );

	it( 'returns false when URL is not in sources', () => {
		const sources = [ { url: 'https://other.com' } ];
		expect( isDuplicate( 'https://example.com', sources ) ).toBe( false );
	} );

	it( 'treats URLs as duplicates regardless of scheme prefix', () => {
		const sources = [ { url: 'https://example.com' } ];
		expect( isDuplicate( 'example.com', sources ) ).toBe( true );
	} );
} );
