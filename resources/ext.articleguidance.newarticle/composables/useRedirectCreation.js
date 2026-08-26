'use strict';

const { ref, computed } = require( 'vue' );
const { checkPagesExist } = require( '../api/MediaWiki.js' );
const { createRedirect: createRedirectPage } = require( '../api/Redirect.js' );
const { isRedirectOfferable } = require( '../utils/redirect.js' );
const instrument = require( '../logging/instrument.js' );

/**
 * Offer and perform the redirect the subject-covered step can create (T426844).
 *
 * @param {Object} inputs Reactive references
 * @param {Object} inputs.redLinkTitle Red link the user followed, if any
 * @param {Object} inputs.searchQuery Title currently in the search box
 * @param {Object} inputs.targetTitle Existing article to redirect to
 * @return {Object} Redirect state and actions
 */
function useRedirectCreation( { redLinkTitle, searchQuery, targetTitle } ) {
	// 'idle' -> 'saving' -> 'created' -> 'done', or 'saving' -> 'error'.
	const redirectState = ref( 'idle' );
	const redirectErrorCode = ref( null );
	const redLinkExists = ref( null );

	const canCreateRedirect = computed( () => isRedirectOfferable(
		redLinkTitle.value,
		searchQuery.value,
		targetTitle.value,
		redLinkExists.value
	) );

	/**
	 * Find out whether the red-link title still points at a missing page.
	 *
	 * @return {Promise<void>}
	 */
	async function checkRedLink() {
		if ( !redLinkTitle.value ) {
			return;
		}
		redLinkExists.value = null;
		try {
			const existence = await checkPagesExist( [ redLinkTitle.value ] );
			redLinkExists.value = !!existence[ redLinkTitle.value ];
		} catch ( err ) {
			// Leave it unknown; the option stays hidden.
		}
	}

	/**
	 * Turn the red link the user followed into a redirect to the existing article.
	 *
	 * @return {Promise<void>}
	 */
	async function createRedirect() {
		// Defensive; the step already gates both buttons on these conditions.
		if ( redirectState.value === 'saving' || !canCreateRedirect.value ) {
			return;
		}
		const source = redLinkTitle.value;
		const target = targetTitle.value;

		redirectState.value = 'saving';
		redirectErrorCode.value = null;

		try {
			await createRedirectPage( source, target );
			redirectState.value = 'created';
			instrument.logRedirectCreated( true );
		} catch ( code ) {
			// mw.Api rejects with the Action API error code; awaiting a jQuery
			// promise keeps only that first argument.
			const errorCode = code || 'unknown';
			redirectState.value = 'error';
			redirectErrorCode.value = errorCode;
			// The title was taken in the meantime, so retrying can only fail again;
			// record that so neither the retry nor the button returns.
			if ( errorCode === 'articleexists' ) {
				redLinkExists.value = true;
			}
			instrument.logRedirectCreated( false, errorCode );
		}
	}

	/**
	 * Dismiss the success or error message.
	 */
	function dismissRedirectMessage() {
		redirectState.value = redirectState.value === 'error' ? 'idle' : 'done';
	}

	return {
		redirectState,
		redirectErrorCode,
		canCreateRedirect,
		checkRedLink,
		createRedirect,
		dismissRedirectMessage
	};
}

module.exports = useRedirectCreation;
