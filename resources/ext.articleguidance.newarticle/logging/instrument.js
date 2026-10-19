/* eslint-disable camelcase */
const SESSION_KEY = 'ArticleGuidanceFunnelToken';

const { ArticleGuidanceInstrumentName: instrumentName } = require( '../config.json' );

let instrument = null;
let instrumentFailed = false;
const pendingEvents = [];

mw.loader.using( 'ext.testKitchen' ).then( () => {
	instrument = mw.testKitchen.getInstrument( instrumentName );
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

// Set by logInit()
let actionSource = 'direct';

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
	actionSource = source || 'direct';
	const data = {};
	data.action_source = actionSource;
	data.action_context = { title: initialTitle };
	submit( 'init', data );
}

/**
 * Fire when a title search request is sent. Typing and the debounce are excluded.
 *
 * @param {string} searchId Identifies the search. The matching search_end has the same ID.
 * @param {string} query The query that is searched.
 * @param {string} trigger 'mount' when the search step opens with a query, or 'input' when
 *   the user edits the query.
 */
function logSearchStart( searchId, query, trigger ) {
	const data = {};
	data.action_source = actionSource;
	data.action_subtype = trigger;
	data.action_context = { search_id: searchId, query: query };
	submit( 'search_start', data );
}

/**
 * Fire when a title search ends. A search the user leaves has no search_end.
 *
 * @param {string} searchId ID from the matching search_start.
 * @param {string} query The query that was searched, not the current input.
 * @param {string} status 'results', 'no_results', 'error', 'replaced' when a newer search
 *   replaces it, or 'cancelled' when the user clears the query.
 * @param {number} duration Time from search_start to the outcome, in milliseconds.
 * @param {number|null} [resultCount] Number of results shown, for 'results' and 'no_results'.
 * @param {string|null} [path] Search path, for 'results' and 'no_results':
 *   - 'wikidata_direct': Native search results only (no MinT translation used).
 *   - 'mint_fallback_success': Native search returned no results, MinT translation returned
 *     results.
 *   - 'mint_fallback_no_results': Native search returned no results, and MinT translation also
 *     returned no results.
 *   - 'wikidata_and_mint': Both native search and MinT translation returned results and were
 *     merged.
 */
function logSearchEnd( searchId, query, status, duration, resultCount = null, path = null ) {
	const data = {};
	data.action_source = actionSource;
	data.action_subtype = status;
	const context = { search_id: searchId, query: query, duration: duration };
	if ( resultCount !== null ) {
		context.result_count = resultCount;
	}
	if ( path !== null ) {
		context.path = path;
	}
	data.action_context = context;
	submit( 'search_end', data );
}

/**
 * Fire when the page is hidden or shown again, on every step. The last 'hidden' event
 * marks the end of the visit.
 *
 * @param {boolean} hidden True when the page is hidden.
 * @param {string} step The current workflow step.
 * @param {number} stepDuration Time since the step was shown, in milliseconds.
 */
function logVisibilityChange( hidden, step, stepDuration ) {
	const data = {};
	data.action_source = actionSource;
	data.action_subtype = hidden ? 'hidden' : 'visible';
	data.action_context = { step: step, step_duration: stepDuration };
	submit( 'visibility_change', data );
}

/**
 * Fire when the user selects a Wikidata search result card. The outline is not
 * known yet: outline_matched reports it.
 *
 * @param {string} resultQid QID of the clicked Wikidata item.
 */
function logSelectSuggestedTopic( resultQid ) {
	const data = {};
	data.action_subtype = 'suggested_topic';
	data.action_context = { result_qid: resultQid };
	submit( 'select_topic', data );
}

/**
 * Fire when outline matching for the selected Wikidata result finishes.
 *
 * @param {string} resultQid QID of the selected Wikidata item.
 * @param {Object} outline Outline the workflow will use, from outlineEventContext(). Its qids
 *   are ['*'] for the generic guidance outline, which the result falls back to when nothing
 *   matches. The server always serves a generic outline (T437432), so every result continues
 *   the workflow.
 * @param {number} duration Duration of the outlines load and matching, in milliseconds.
 * @param {string} fallback 'none', 'error' when matching failed, or 'timeout' when matching
 *   took too long. The generic outline is used in both cases.
 */
function logOutlineMatched( resultQid, outline, duration, fallback ) {
	const data = {};
	data.action_context = {
		result_qid: resultQid, outline: outline, duration: duration, fallback: fallback
	};
	submit( 'outline_matched', data );
}

/**
 * Fire when the user picks an outline from the browse-by-type panel.
 *
 * @param {Object} outline Selected outline, from outlineEventContext(). Its matched_qid is
 *   always null: the user chose the outline, no Wikidata match did.
 */
function logSelectManualTopic( outline ) {
	const data = {};
	data.action_subtype = 'manual_topic';
	data.action_context = { outline: outline };
	submit( 'select_topic', data );
}

/**
 * Fire when the user continues with the generic outline from the search step.
 * The search step offers this in place of the browse-by-type panel when the
 * wiki has no types (T437432).
 *
 * @param {Object} outline The generic outline, from outlineEventContext(). Its
 *   matched_qid is always null: the user chose the outline, no Wikidata match did.
 */
function logContinueWithGeneric( outline ) {
	const data = {};
	data.action_subtype = 'continue_generic';
	data.action_context = { outline: outline };
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
 * Fire when the sources step mounts.
 */
function logSourcesShown() {
	submit( 'sources_shown' );
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
 * @param {Object} outline Selected outline, from outlineEventContext(). It reports the same
 *   outline that select_topic reported for this session.
 */
function logWriteStart( outline ) {
	const data = {};
	data.action_context = { outline: outline };
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
 * @param {string} subtype 'improve', 'read', 'create_redirect', or 'return'.
 */
function logSubjectCoveredAction( subtype ) {
	const data = {};
	data.action_subtype = subtype;
	submit( 'subject_covered_action', data );
}

/**
 * Fire when a redirect creation attempt finishes.
 *
 * @param {boolean} success Whether the redirect was created.
 * @param {string} [code] Action API error code returned by the failing edit,
 *   e.g. 'articleexists'.
 */
function logRedirectCreated( success, code ) {
	const data = {};
	data.action_subtype = success ? 'success' : 'error';
	if ( !success ) {
		data.action_context = { code: code || 'unknown' };
	}
	submit( 'redirect_created', data );
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
 * Fire when an experienced editor skips guidance to start with a blank page.
 *
 * @param {string} title Title entered before skipping guidance.
 */
function logSkipGuidance( title ) {
	const data = {};
	data.action_context = { title: title };
	submit( 'skip_guidance', data );
}

module.exports = {
	logInit,
	logSearchStart,
	logSearchEnd,
	logVisibilityChange,
	logSelectSuggestedTopic,
	logOutlineMatched,
	logSelectManualTopic,
	logContinueWithGeneric,
	logAddSource,
	logNotabilityAction,
	logNotabilityCheckShown,
	logSourcesShown,
	logGuidanceShown,
	logWriteStart,
	logSubjectCoveredShown,
	logSubjectCoveredAction,
	logRedirectCreated,
	logTitleConflictShown,
	logTitleConflictAction,
	logSkipGuidance
};
