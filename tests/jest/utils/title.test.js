'use strict';

const { isValidTitle, getInvalidTitleCharacters } = require( '../../../resources/ext.articleguidance.newarticle/utils/title.js' );

describe( 'title utils', () => {
	describe( 'isValidTitle', () => {
		it( 'returns false for empty or whitespace-only strings', () => {
			expect( isValidTitle( '' ) ).toBe( false );
			expect( isValidTitle( '   ' ) ).toBe( false );
			expect( isValidTitle( null ) ).toBe( false );
			expect( isValidTitle( undefined ) ).toBe( false );
		} );

		it( 'returns true for a valid page title in the Main namespace', () => {
			expect( isValidTitle( 'Valid Article' ) ).toBe( true );
			expect( isValidTitle( 'Quantum physics' ) ).toBe( true );
			expect( isValidTitle( 'Avengers: Endgame' ) ).toBe( true );
		} );

		it( 'returns false for titles with illegal characters', () => {
			expect( isValidTitle( '[KHK2017]_165' ) ).toBe( false );
			expect( isValidTitle( 'Title <with> brackets' ) ).toBe( false );
			expect( isValidTitle( 'Article#Section' ) ).toBe( false );
			expect( isValidTitle( '#Section' ) ).toBe( false );
			expect( isValidTitle( '#' ) ).toBe( false );
		} );

		it( 'returns false for titles in non-main namespaces', () => {
			expect( isValidTitle( 'User:MyName' ) ).toBe( false );
			expect( isValidTitle( 'Wikipedia:About' ) ).toBe( false );
			expect( isValidTitle( 'Talk:Some Article' ) ).toBe( false );
			expect( isValidTitle( 'User:' ) ).toBe( false );
			expect( isValidTitle( 'Special:' ) ).toBe( false );
		} );
	} );

	describe( 'getInvalidTitleCharacters', () => {
		it( 'returns empty array for valid strings or empty input', () => {
			expect( getInvalidTitleCharacters( '' ) ).toEqual( [] );
			expect( getInvalidTitleCharacters( null ) ).toEqual( [] );
			expect( getInvalidTitleCharacters( 'Valid Article Name 123' ) ).toEqual( [] );
			expect( getInvalidTitleCharacters( 'Avengers: Endgame' ) ).toEqual( [] );
		} );

		it( 'extracts unique invalid characters from title', () => {
			expect( getInvalidTitleCharacters( '[Draft]' ) ).toEqual( [ '[', ']' ] );
			expect( getInvalidTitleCharacters( '{Formula} | <Test> #' ) ).toEqual( [ '{', '}', '|', '<', '>', '#' ] );
			expect( getInvalidTitleCharacters( 'Article#Section' ) ).toEqual( [ '#' ] );
			expect( getInvalidTitleCharacters( '[[Multiple]][[Duplicates]]' ) ).toEqual( [ '[', ']' ] );
		} );

		it( 'extracts disallowed namespace prefixes', () => {
			expect( getInvalidTitleCharacters( 'User:' ) ).toEqual( [ 'User:' ] );
			expect( getInvalidTitleCharacters( 'User:MyName' ) ).toEqual( [ 'User:' ] );
			expect( getInvalidTitleCharacters( 'Special:RecentChanges' ) ).toEqual( [ 'Special:' ] );
			expect( getInvalidTitleCharacters( 'Wikipedia:About' ) ).toEqual( [ 'Wikipedia:' ] );
		} );

		it( 'extracts both namespace prefixes and invalid characters when combined', () => {
			expect( getInvalidTitleCharacters( 'User:[Draft]' ) ).toEqual( [ '[', ']', 'User:' ] );
		} );
	} );
} );
