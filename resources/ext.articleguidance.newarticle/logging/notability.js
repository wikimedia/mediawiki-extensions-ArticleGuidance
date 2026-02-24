/* eslint-disable no-console */
/**
 * Console reporter for notability tag evaluation.
 */

const DIVIDER = '───────────────────────────────────────────';

/**
 * Log a grouped notability evaluation report to the browser console.
 *
 * @param {Object} outline Selected outline object
 * @param {Array} tagResults Pre-computed array of { tag, active, detail }
 * @param {Object|null} selectedResult The Wikidata match, or null (for the group title)
 */
function reportNotabilityEvaluation( outline, tagResults, selectedResult ) {
	if ( !outline || !outline.notabilityRisk ) {
		return;
	}

	const articleLabel = outline.label || outline.articleType || 'unknown';
	const qid = selectedResult ? selectedResult.id : null;
	const title = qid ?
		`[ArticleGuidance] Notability evaluation — ${ articleLabel } (${ qid })` :
		`[ArticleGuidance] Notability evaluation — ${ articleLabel }`;

	console.group( title );
	console.log( `  Tags in outline: ${ tagResults.map( ( r ) => r.tag ).join( ', ' ) }` );
	console.log( `  ${ DIVIDER }` );

	tagResults.forEach( ( { tag, active, detail } ) => {
		const marker = active ? '✗ ACTIVE  ' : '✓ inactive';
		console.log( `  ${ tag.padEnd( 12 ) }${ marker }  ${ detail }` );
	} );

	console.log( `  ${ DIVIDER }` );

	const activeNonSources = tagResults
		.filter( ( r ) => r.active && r.tag !== 'sources' )
		.map( ( r ) => r.tag );

	if ( activeNonSources.length > 0 ) {
		console.log( `  → Notability step will SHOW  (active tags: ${ activeNonSources.join( ', ' ) })` );
	} else {
		console.log( '  → Notability step will SKIP  (no active tags)' );
	}

	console.groupEnd();
}

module.exports = { reportNotabilityEvaluation };
