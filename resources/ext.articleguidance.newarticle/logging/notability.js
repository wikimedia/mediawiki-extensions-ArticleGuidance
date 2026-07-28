/* eslint-disable no-console */
/**
 * Console reporter for notability tag evaluation.
 */

const DIVIDER = '───────────────────────────────────────────';
// Width of the widest row label ('Outline:'), so the block lines up.
const LABEL_WIDTH = 10;

/**
 * Format one articleTypes entry for display.
 *
 * An outline can list several Wikidata items (T421260), each with its own
 * depth and match property, so every entry is shown rather than just the first.
 * A null matchVia means the default P31 path, as in propForGroup().
 *
 * @param {Object} typeEntry One { id, hierarchyDepth, matchVia } entry
 * @return {string}
 */
function formatArticleType( typeEntry ) {
	const depth = ( typeEntry.hierarchyDepth !== null &&
		typeEntry.hierarchyDepth !== undefined ) ? typeEntry.hierarchyDepth : '?';
	const via = typeEntry.matchVia || 'P31 default';
	return `${ typeEntry.id } (depth ${ depth }, via ${ via })`;
}

/**
 * Explain a SHOW/SKIP verdict in terms of the evaluated tags.
 *
 * Mirrors the gating in evaluateNotabilityTags(): `junior` never shows the step
 * on its own, and a present-but-inactive `junior` tag suppresses it entirely.
 *
 * @param {Array} tagResults Array of { tag, active, detail }
 * @param {boolean} willShow The authoritative verdict
 * @return {string}
 */
function explainVerdict( tagResults, willShow ) {
	if ( willShow ) {
		const triggering = tagResults
			.filter( ( r ) => r.active && r.tag !== 'junior' )
			.map( ( r ) => r.tag );
		return `active tags: ${ triggering.join( ', ' ) }`;
	}
	const junior = tagResults.find( ( r ) => r.tag === 'junior' );
	if ( junior !== undefined && !junior.active ) {
		return 'junior gate — user is not a junior editor';
	}
	return 'no active tags';
}

/**
 * Log a grouped notability evaluation report to the browser console.
 *
 * @param {Object} outline Selected outline object
 * @param {Array} tagResults Pre-computed array of { tag, active, detail }
 * @param {boolean} willShow Whether the notability step will be shown, as
 *   decided by evaluateNotabilityTags(). Passed in rather than re-derived so
 *   the report can never disagree with the routing it is explaining.
 * @param {Object|null} selectedResult The Wikidata match, or null (for the group title)
 */
function reportNotabilityEvaluation( outline, tagResults, willShow, selectedResult ) {
	const debugParam = mw.util.getParamValue( 'debug' );
	if ( debugParam !== '1' && debugParam !== 'true' ) {
		return;
	}

	if ( !outline || !outline.notabilityRisk ) {
		return;
	}

	const articleLabel = outline.label ||
		( outline.articleTypes && outline.articleTypes[ 0 ] && outline.articleTypes[ 0 ].id ) ||
		'unknown';
	const qid = selectedResult ? selectedResult.id : null;
	const title = qid ?
		`[ArticleGuidance] Notability evaluation — ${ articleLabel } (${ qid })` :
		`[ArticleGuidance] Notability evaluation — ${ articleLabel }`;

	console.group( title );
	console.log( `  ${ 'Outline:'.padEnd( LABEL_WIDTH ) }${ outline.title }` );
	( outline.articleTypes || [] ).forEach( ( typeEntry, i ) => {
		const label = i === 0 ? 'Types:' : '';
		console.log( `  ${ label.padEnd( LABEL_WIDTH ) }${ formatArticleType( typeEntry ) }` );
	} );
	console.log( `  ${ 'Tags:'.padEnd( LABEL_WIDTH ) }${ tagResults.map( ( r ) => r.tag ).join( ', ' ) }` );
	console.log( `  ${ DIVIDER }` );

	tagResults.forEach( ( { tag, active, detail } ) => {
		const marker = active ? '✗ ACTIVE  ' : '✓ inactive';
		console.log( `  ${ tag.padEnd( 12 ) }${ marker }  ${ detail }` );
	} );

	console.log( `  ${ DIVIDER }` );

	const outcome = willShow ? 'SHOW' : 'SKIP';
	console.log( `  → Notability step will ${ outcome }  (${ explainVerdict( tagResults, willShow ) })` );

	console.groupEnd();
}

module.exports = { reportNotabilityEvaluation };
