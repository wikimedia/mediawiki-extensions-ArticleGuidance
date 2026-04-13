/* eslint-disable camelcase */
const SESSION_KEY = 'ArticleGuidanceFunnelToken';

const { ArticleGuidanceExperimentName: experimentName } = require( '../config.json' );

let instrument = null;
let instrumentFailed = false;
const pendingEvents = [];

mw.loader.using( 'ext.testKitchen' ).then( () => {
	instrument = mw.testKitchen.compat.getExperiment( experimentName );
	pendingEvents.splice( 0 ).forEach( ( [ action, data ] ) => instrument.send( action, data ) );
} ).catch( () => {
	instrumentFailed = true;
	pendingEvents.splice( 0 );
} );

let funnelEntryToken = mw.storage.session.get( SESSION_KEY );
if ( !funnelEntryToken ) {
	funnelEntryToken = mw.user.generateRandomSessionId();
	mw.storage.session.set( SESSION_KEY, funnelEntryToken );
}

function submit( action, extraData ) {
	if ( instrumentFailed ) {
		return;
	}
	const data = Object.assign( {}, extraData || {} );
	data.funnel_entry_token = funnelEntryToken;
	// typeof null === 'object', so the null check is intentional
	if ( data.action_context !== null && typeof data.action_context === 'object' ) {
		data.action_context = JSON.stringify( data.action_context );
	}
	if ( !instrument ) {
		pendingEvents.push( [ action, data ] );
		return;
	}
	instrument.send( action, data );
}

/**
 * Fire the init event when Special:NewArticle mounts.
 *
 * @param {string} initialTitle Pre-filled article title, if any.
 * @param {string} source Entry point: 'redlink', 'articlewizard', or 'direct'.
 */
function logInit( initialTitle, source ) {
	const data = {};
	data.action_source = source || 'direct';
	data.action_context = { title: initialTitle };
	submit( 'init', data );
}

/**
 * Fire when a debounced title search completes.
 *
 * @param {string} query Search query that was submitted.
 * @param {number} resultCount Number of results returned.
 */
function logWriteTitle( query, resultCount ) {
	const data = {};
	data.action_context = { query: query, result_count: resultCount };
	submit( 'write_title', data );
}

/**
 * Fire when the user selects a Wikidata search result card.
 *
 * @param {string} resultQid QID of the clicked Wikidata item.
 * @param {{title: string, qid: string}} outline Matched outline type.
 */
function logSelectSuggestedTopic( resultQid, outline ) {
	const data = {};
	data.action_subtype = 'suggested_topic';
	data.action_context = { result_qid: resultQid, outline: outline };
	submit( 'select_topic', data );
}

/**
 * Fire when the user picks an outline from the browse-by-type panel.
 *
 * @param {{title: string, qid: string}} outline Selected outline type.
 */
function logSelectManualTopic( outline ) {
	const data = {};
	data.action_subtype = 'manual_topic';
	data.action_context = outline;
	submit( 'select_topic', data );
}

/**
 * Fire when a source URL is validated by the API.
 *
 * @param {boolean} isValid True for accepted sources, false for spam or discouraged sources.
 * @param {string} url The source URL submitted.
 * @param {string} domain The domain extracted by the API.
 * @param {string} classification The classification returned by the API.
 * @param {boolean} mandatory True when the selected outline requires sources to proceed.
 */
function logAddSource( isValid, url, domain, classification, mandatory ) {
	const data = {};
	data.action_subtype = isValid ? 'valid' : 'invalid';
	data.action_context = {
		url: url, domain: domain, classification: classification, mandatory: mandatory
	};
	submit( 'add_source', data );
}

/**
 * Fire when the user clicks a notability option.
 *
 * @param {string} subtype Option chosen: 'wikidata_item', 'sandbox', or 'learn'.
 */
function logNotabilityAction( subtype ) {
	const data = {};
	data.action_subtype = subtype;
	submit( 'notability_action', data );
}

/**
 * Fire when the notability step mounts.
 *
 * @param {string[]} tags Active notability tags that triggered the check.
 */
function logNotabilityCheckShown( tags ) {
	const data = {};
	data.action_context = { tags: tags };
	submit( 'notability_check_shown', data );
}

/**
 * Fire when the instructions step mounts.
 */
function logGuidanceShown() {
	submit( 'guidance_shown' );
}

/**
 * Fire when the user clicks "Start Writing".
 *
 * @param {{title: string, qid: string}} outline Selected outline type.
 */
function logWriteStart( outline ) {
	const data = {};
	data.action_context = outline;
	submit( 'write_start', data );
}

/**
 * Fire when the subject-covered step mounts.
 */
function logSubjectCoveredShown() {
	submit( 'subject_covered_shown' );
}

/**
 * Fire when the user acts on the subject-covered step.
 *
 * @param {string} subtype 'improve' or 'read'.
 */
function logSubjectCoveredAction( subtype ) {
	const data = {};
	data.action_subtype = subtype;
	submit( 'subject_covered_action', data );
}

/**
 * Fire when the title-conflict step mounts.
 */
function logTitleConflictShown() {
	submit( 'title_conflict_shown' );
}

/**
 * Fire when the user acts on the title-conflict step.
 *
 * @param {string} subtype 'continue', 'use_suggestion', or 'view_existing'.
 */
function logTitleConflictAction( subtype ) {
	const data = {};
	data.action_subtype = subtype;
	submit( 'title_conflict_action', data );
}

/**
 * Fire when the unsupported-subject step mounts.
 */
function logUnsupportedSubjectShown() {
	submit( 'unsupported_subject_shown' );
}

/**
 * Fire when the user acts on the unsupported-subject step.
 *
 * @param {string} subtype 'request_support' or 'start_writing'.
 */
function logUnsupportedSubjectAction( subtype ) {
	const data = {};
	data.action_subtype = subtype;
	submit( 'unsupported_subject_action', data );
}

module.exports = {
	logInit,
	logWriteTitle,
	logSelectSuggestedTopic,
	logSelectManualTopic,
	logAddSource,
	logNotabilityAction,
	logNotabilityCheckShown,
	logGuidanceShown,
	logWriteStart,
	logSubjectCoveredShown,
	logSubjectCoveredAction,
	logTitleConflictShown,
	logTitleConflictAction,
	logUnsupportedSubjectShown,
	logUnsupportedSubjectAction
};
