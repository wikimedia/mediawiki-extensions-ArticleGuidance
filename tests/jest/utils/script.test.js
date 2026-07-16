'use strict';

const { containsNonLatin } = require( '../../../resources/ext.articleguidance.newarticle/utils/script.js' );

describe( 'containsNonLatin', () => {
	it( 'returns false for a plain Latin query', () => {
		expect( containsNonLatin( 'Mahatma Gandhi' ) ).toBe( false );
	} );

	it( 'returns false for Latin with diacritics, digits and punctuation', () => {
		expect( containsNonLatin( 'Café del Mar 2, "naïve"!' ) ).toBe( false );
	} );

	it( 'returns false for empty or missing input', () => {
		expect( containsNonLatin( '' ) ).toBe( false );
		expect( containsNonLatin( null ) ).toBe( false );
		expect( containsNonLatin( undefined ) ).toBe( false );
	} );

	it( 'returns true for Devanagari', () => {
		expect( containsNonLatin( 'महात्मा गांधी' ) ).toBe( true );
	} );

	it( 'returns true for Bengali', () => {
		expect( containsNonLatin( 'ওমর আব্দুলকাদির আর্তান' ) ).toBe( true );
	} );

	it( 'returns true for Arabic', () => {
		expect( containsNonLatin( 'فيروز' ) ).toBe( true );
	} );

	it( 'returns true for a mixed Latin/non-Latin query', () => {
		expect( containsNonLatin( 'Gandhi गांधी' ) ).toBe( true );
	} );
} );
