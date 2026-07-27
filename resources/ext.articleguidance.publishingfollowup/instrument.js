/* eslint-disable camelcase */
const { ArticleGuidanceExperimentName: experimentName } = require( './config.json' );

// Funnel token seeded by the newarticle module earlier in the same session, so the
// post-publish connect event joins the rest of the Article Guidance funnel. Read-only
// here: if the token is absent we send the event without it rather than mint a new,
// disconnected one.
const SESSION_KEY = 'ArticleGuidanceFunnelToken';

let instrument = null;
let instrumentFailed = false;
const pendingEvents = [];

mw.loader.using( 'ext.testKitchen' ).then( () => {
	instrument = mw.testKitchen.compat.getExperiment( experimentName );
	pendingEvents.splice( 0 ).forEach( ( event ) => instrument.send( event[ 0 ], event[ 1 ] ) );
} ).catch( () => {
	instrumentFailed = true;
	pendingEvents.splice( 0 );
} );

function submit( action, data ) {
	if ( instrumentFailed ) {
		return;
	}
	// typeof null === 'object', so the null check is intentional
	if ( data.action_context !== null && typeof data.action_context === 'object' ) {
		data.action_context = JSON.stringify( data.action_context );
	}
	const token = mw.storage.session.get( SESSION_KEY );
	if ( token ) {
		data.funnel_entry_token = token;
	}
	if ( !instrument ) {
		pendingEvents.push( [ action, data ] );
		return;
	}
	instrument.send( action, data );
}

/**
 * Report the outcome of the automatic post-publish Wikidata connect.
 *
 * @param {string} subtype One of 'connected', 'already_linked', 'missing_item', or 'error'.
 * @param {string} itemId The Wikidata item Q-id the article was to be connected to.
 * @param {string} [errorCode] API error code, when subtype is 'error'.
 */
function logConnectResult( subtype, itemId, errorCode ) {
	const context = { item_id: itemId };
	if ( errorCode ) {
		context.error_code = errorCode;
	}
	submit( 'wikidata_connect', {
		action_subtype: subtype,
		action_context: context
	} );
}

module.exports = { logConnectResult };
