const { computed } = require( 'vue' );
const { isValidTitle, getInvalidTitleCharacters } = require( '../utils/title.js' );

/**
 * Composable for validating an article title and extracting invalid items.
 *
 * @param {Object} titleRef - Reactive reference to the title input string
 * @return {Object} Reactive title validation states
 *   (invalidTitle, invalidCharacters, invalidTitleErrorText, validTitle)
 */
function useTitleValidation( titleRef ) {
	const invalidTitle = computed( () => {
		const query = titleRef.value && titleRef.value.trim();
		return query ? !isValidTitle( query ) : false;
	} );

	const invalidCharacters = computed( () => {
		if ( !invalidTitle.value ) {
			return '';
		}
		return getInvalidTitleCharacters( titleRef.value ).join( ', ' );
	} );

	const invalidTitleErrorText = computed( () => {
		if ( !invalidTitle.value ) {
			return '';
		}
		if ( invalidCharacters.value ) {
			return mw.message(
				'articleguidance-specialnewarticle-invalid-title',
				invalidCharacters.value
			).text();
		}
		return mw.message( 'articleguidance-specialnewarticle-invalid-title-generic' ).text();
	} );

	const validTitle = computed( () => invalidTitle.value ? '' : titleRef.value );

	return {
		invalidTitle,
		invalidCharacters,
		invalidTitleErrorText,
		validTitle
	};
}

module.exports = useTitleValidation;
