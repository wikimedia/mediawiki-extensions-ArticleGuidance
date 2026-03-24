/**
 * Evaluation utilities for notability tags.
 * Thresholds are read from mw.config (wgArticleGuidanceJuniorEditorThreshold,
 * wgArticleGuidanceCrossWikiThreshold).
 */

/**
 * Evaluate a single notability tag against the current state.
 *
 * @param {string} tag
 * @param {Object} state
 * @param {Object|null} state.selectedResult
 * @param {number|null} state.sitelinkCount
 * @param {number} state.userEditCount
 * @return {{ active: boolean, detail: string }}
 */
function evaluateTag( tag, state ) {
	switch ( tag ) {
		case 'wikidata': {
			const active = !state.selectedResult;
			return {
				active,
				detail: active ?
					'no Wikidata match selected' :
					`Wikidata match present (${ state.selectedResult.id })`
			};
		}
		case 'crosswiki': {
			const min = mw.config.get( 'wgArticleGuidanceCrossWikiThreshold' );
			const count = state.sitelinkCount;
			const active = count === null || count < min;
			const countLabel = count === null ? 'null' : String( count );
			return {
				active,
				detail: active ?
					`sitelinkCount (${ countLabel }) < threshold (${ min })` :
					`sitelinkCount (${ countLabel }) >= threshold (${ min })`
			};
		}
		case 'sources': {
			return {
				active: false,
				detail: 'Adding sources will be made mandatory in the sources step.'
			};
		}
		case 'junior': {
			const threshold = mw.config.get( 'wgArticleGuidanceJuniorEditorThreshold' );
			const active = state.userEditCount < threshold;
			return {
				active,
				detail: active ?
					`userEditCount (${ state.userEditCount }) < threshold (${ threshold })` :
					`userEditCount (${ state.userEditCount }) >= threshold (${ threshold })`
			};
		}
		case 'draft': {
			return {
				active: true,
				detail: 'Editor will be invited to start article in draft or user space.'
			};
		}
		default:
			return { active: false, detail: 'unknown tag' };
	}
}

/**
 * Evaluate all notability tags for an outline.
 *
 * @param {Object|null} outline
 * @param {Object} state Same shape as accepted by evaluateTag
 * @return {Object} tagResults (Array of {tag, active, detail}) and willShow (boolean)
 */
function evaluateNotabilityTags( outline, state ) {
	if ( !outline || !outline.notabilityRisk ) {
		return { tagResults: [], willShow: false };
	}
	const tagResults = outline.notabilityRisk.map( ( tag ) => {
		const evaluation = evaluateTag( tag, state );
		return { tag: tag, active: evaluation.active, detail: evaluation.detail };
	} );
	const willShow = tagResults.some( ( r ) => r.active && r.tag !== 'sources' );
	return { tagResults, willShow };
}

module.exports = { evaluateTag, evaluateNotabilityTags };
