/**
 * Outlier detection over the outline builder's list of example articles.
 *
 * The generator aggregates whichever articles are *selected*: a section is kept
 * when it appears in at least half of them (SECTION_THRESHOLD in
 * outlineGenerator.js) and the recommended sources are the union of every domain
 * any of them cites. An atypical article therefore does more than fail to
 * contribute: a thin one raises the section bar for every other article, and a
 * sprawling one dumps a disproportionate share of domains into the outline.
 * Either way the damage is permanent, so the tails start deselected, before the
 * page generates the first draft.
 *
 * Judged relative to the cohort rather than against absolute floors, because
 * what counts as thin depends on the type. isStub() in articleFinder.js keeps
 * the absolute floors for ranking; a 20 KB article in a cohort of capital cities
 * clears those while still being a clear outlier here.
 *
 * Section count is cut at both tails, byte length only at the low one. An
 * article with far more sections than the cohort is usually a different kind of
 * page — a list, or a broader subject — and since the sources are a union it
 * dumps a disproportionate share of domains into the outline. A merely long
 * article that shares the cohort's structure is a good exemplar, just a
 * thorough one.
 */

'use strict';

// Below this many articles a median is not worth trusting, so nothing is cut.
// Also the floor on what pruning may leave behind.
const MIN_POOL = 5;

// How many deviations from the median the cut-offs sit.
const DEVIATIONS = 2;

// Floor on the deviation scale, as a share of the median. A cohort where most
// values are identical has a deviation of 0, which would otherwise put the
// cut-off at the median itself and flag values a hair below it.
const MIN_RELATIVE_SCALE = 0.15;

// The metrics that drive the outline, in the order their reason is reported.
// Sections come first: they shape the outline's structure directly.
const METRICS = [
	{
		key: 'sections',
		lowReason: 'sections-low',
		highReason: 'sections-high',
		// "More sections than typical" only means something when the typical
		// article is itself developed — a lead plus a couple of headings. In a
		// cohort that is mostly stubs the median sits in the tail, and cutting the
		// high side there would deselect the only usable examples.
		highFloor: 3
	},
	{
		key: 'sizeBytes',
		lowReason: 'size',
		highReason: null,
		highFloor: 0
	}
];

/**
 * @param {number[]} values Non-empty for a result
 * @return {number|null} Median, or null for an empty list
 */
function median( values ) {
	if ( values.length === 0 ) {
		return null;
	}
	const sorted = values.slice().sort( ( a, b ) => a - b );
	const mid = Math.floor( sorted.length / 2 );
	return sorted.length % 2 === 0 ?
		( sorted[ mid - 1 ] + sorted[ mid ] ) / 2 :
		sorted[ mid ];
}

/**
 * Cut-offs for one metric, from the median and the median absolute deviation
 * (robust to the very outliers we are looking for, unlike a mean and standard
 * deviation).
 *
 * @param {number[]} values
 * @return {{ median: number, low: number, high: number }|null} null when the
 *   cohort offers no signal
 */
function cutoffs( values ) {
	const mid = median( values );
	if ( mid === null || mid <= 0 ) {
		return null;
	}
	const deviation = median( values.map( ( value ) => Math.abs( value - mid ) ) );
	const scale = Math.max( deviation, mid * MIN_RELATIVE_SCALE );
	return {
		median: mid,
		low: mid - DEVIATIONS * scale,
		high: mid + DEVIATIONS * scale
	};
}

/**
 * Find the articles that sit in the cohort's tails.
 *
 * @param {Array<Object>} articles Rows with item, quality, sizeBytes, sections
 * @return {Object<string,string>} Map of item → reason key ('sections-low',
 *   'sections-high' or 'size'), holding only the outliers. Empty when nothing
 *   should be cut.
 */
function findOutliers( articles ) {
	if ( articles.length < MIN_POOL ) {
		return {};
	}

	const bounds = {};
	METRICS.forEach( ( metric ) => {
		const values = articles
			.map( ( article ) => article[ metric.key ] )
			.filter( ( value ) => Number.isFinite( value ) );
		bounds[ metric.key ] = values.length < MIN_POOL ? null : cutoffs( values );
	} );

	const reasons = {};
	articles.forEach( ( article ) => {
		// A quality badge is a human judgement that outranks the cohort
		// statistics — the same exemption isStub() makes.
		if ( article.quality ) {
			return;
		}
		// Articles whose details could not be fetched have a null metric; absence
		// of evidence is not evidence of an atypical article, so they are left
		// alone.
		METRICS.some( ( metric ) => {
			const bound = bounds[ metric.key ];
			const value = article[ metric.key ];
			if ( bound === null || !Number.isFinite( value ) ) {
				return false;
			}
			if ( value < bound.low ) {
				reasons[ article.item ] = metric.lowReason;
				return true;
			}
			if ( metric.highReason !== null &&
				bound.median >= metric.highFloor &&
				value > bound.high
			) {
				reasons[ article.item ] = metric.highReason;
				return true;
			}
			return false;
		} );
	} );

	// Pruning that would leave too little to aggregate is not worth doing: a
	// cohort that is mostly tail needs the maintainer's judgement, not ours.
	const kept = articles.length - Object.keys( reasons ).length;
	return kept < MIN_POOL ? {} : reasons;
}

module.exports = {
	findOutliers
};
