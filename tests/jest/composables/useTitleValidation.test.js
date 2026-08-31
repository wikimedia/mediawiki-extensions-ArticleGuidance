'use strict';

const { ref } = require( 'vue' );
const useTitleValidation = require( '../../../resources/ext.articleguidance.newarticle/composables/useTitleValidation.js' );

describe( 'useTitleValidation', () => {
	it( 'initializes correctly for empty title', () => {
		const title = ref( '' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( false );
		expect( invalidCharacters.value ).toBe( '' );
		expect( invalidTitleErrorText.value ).toBe( '' );
		expect( validTitle.value ).toBe( '' );
	} );

	it( 'evaluates valid title in Main namespace', () => {
		const title = ref( 'Valid Article' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( false );
		expect( invalidCharacters.value ).toBe( '' );
		expect( invalidTitleErrorText.value ).toBe( '' );
		expect( validTitle.value ).toBe( 'Valid Article' );
	} );

	it( 'flags invalid title with illegal characters and formats error message', () => {
		const title = ref( 'Article [with] brackets' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( true );
		expect( invalidCharacters.value ).toBe( '[, ]' );
		expect( invalidTitleErrorText.value ).toBe(
			'articleguidance-specialnewarticle-invalid-title:[, ]'
		);
		expect( validTitle.value ).toBe( '' );
	} );

	it( 'flags invalid title with non-main namespace prefix', () => {
		const title = ref( 'User:MyPage' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( true );
		expect( invalidCharacters.value ).toBe( 'User:' );
		expect( invalidTitleErrorText.value ).toBe(
			'articleguidance-specialnewarticle-invalid-title:User:'
		);
		expect( validTitle.value ).toBe( '' );
	} );

	it( 'returns generic error message when no specific characters are matched', () => {
		// Mock title that fails newFromText with no illegal chars matched
		const title = ref( 'Main:' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( true );
		expect( invalidCharacters.value ).toBe( '' );
		expect( invalidTitleErrorText.value ).toBe(
			'articleguidance-specialnewarticle-invalid-title-generic'
		);
		expect( validTitle.value ).toBe( '' );
	} );

	it( 'reactively updates when title ref changes', () => {
		const title = ref( 'Valid Title' );
		const {
			invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle
		} = useTitleValidation( title );

		expect( invalidTitle.value ).toBe( false );
		expect( invalidTitleErrorText.value ).toBe( '' );
		expect( validTitle.value ).toBe( 'Valid Title' );

		title.value = 'Invalid {title}';
		expect( invalidTitle.value ).toBe( true );
		expect( invalidCharacters.value ).toBe( '{, }' );
		expect( invalidTitleErrorText.value ).toBe(
			'articleguidance-specialnewarticle-invalid-title:{, }'
		);
		expect( validTitle.value ).toBe( '' );

		title.value = 'Fixed Title';
		expect( invalidTitle.value ).toBe( false );
		expect( invalidCharacters.value ).toBe( '' );
		expect( invalidTitleErrorText.value ).toBe( '' );
		expect( validTitle.value ).toBe( 'Fixed Title' );
	} );
} );
