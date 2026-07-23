'use strict';

/**
 * Groups the selected example articles by the shape of their section structure.
 *
 * A frequency threshold applied to the whole cohort gives an "average" skeleton
 * that no real article has. One article type often holds several kinds of page —
 * an art museum and a historic house, a pre-modern and a contemporary person —
 * and a plain threshold unions their sections into one list. Clustering finds
 * those kinds, so the generator can build the skeleton from the largest kind
 * alone and report the others to the maintainer.
 *
 * An article's signature is the set of its level-2 content headings. Two
 * signatures are compared with the Jaccard index. Groups are built by
 * agglomerative clustering with average linkage: merge the two most similar
 * groups, and repeat while the best pair stays above the threshold. The cohort
 * holds at most a few dozen articles, so the direct O(n^3) walk is cheap and
 * needs no distance cache.
 */

// Two groups merge while their average pairwise similarity is at least this.
const MERGE_THRESHOLD = 0.4;

// A group must hold this many articles, and this share of the cohort, before it
// is treated as the dominant shape. Below either bar the cohort has no clear
// split and every article keeps its vote.
const MIN_DOMINANT_MEMBERS = 5;
const MIN_DOMINANT_SHARE = 0.5;

// A group smaller than this is noise, not a shape worth reporting.
const MIN_REPORTED_MEMBERS = 2;

/**
 * Jaccard index of two sets: the share of their union that they share.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @return {number} 0 (nothing in common, or nothing to compare) to 1 (identical)
 */
function jaccard( a, b ) {
	let intersection = 0;
	a.forEach( ( value ) => {
		if ( b.has( value ) ) {
			intersection++;
		}
	} );
	const union = a.size + b.size - intersection;
	// Two articles with no headings share no evidence, so they do not count as
	// similar. Returning 0 keeps them from merging into a shape of their own.
	return union === 0 ? 0 : intersection / union;
}

/**
 * Average similarity between the members of two groups (average linkage).
 *
 * @param {number[]} groupA Article indices
 * @param {number[]} groupB Article indices
 * @param {Array<Set<string>>} sets Signature per article index
 * @return {number}
 */
function averageSimilarity( groupA, groupB, sets ) {
	let total = 0;
	groupA.forEach( ( i ) => {
		groupB.forEach( ( j ) => {
			total += jaccard( sets[ i ], sets[ j ] );
		} );
	} );
	return total / ( groupA.length * groupB.length );
}

/**
 * Group the articles by the shape of their section structure.
 *
 * @param {Array<string[]>} signatures Normalized content-heading keys per article
 * @return {Array<number[]>} Groups of article indices, largest group first. Every
 *   article appears in exactly one group; an article that matches nothing else is
 *   a group of one.
 */
function clusterByStructure( signatures ) {
	const sets = signatures.map( ( keys ) => new Set( keys ) );
	let groups = sets.map( ( set, index ) => [ index ] );

	while ( groups.length > 1 ) {
		let bestScore = -1;
		let bestA = -1;
		let bestB = -1;
		for ( let i = 0; i < groups.length; i++ ) {
			for ( let j = i + 1; j < groups.length; j++ ) {
				const score = averageSimilarity( groups[ i ], groups[ j ], sets );
				if ( score > bestScore ) {
					bestScore = score;
					bestA = i;
					bestB = j;
				}
			}
		}
		if ( bestScore < MERGE_THRESHOLD ) {
			break;
		}
		const merged = groups[ bestA ].concat( groups[ bestB ] );
		groups = groups.filter( ( group, index ) => index !== bestA && index !== bestB );
		groups.push( merged );
	}

	return groups
		.map( ( group ) => group.slice().sort( ( a, b ) => a - b ) )
		// Largest first; ties keep the cohort's own order, so the result is stable.
		.sort( ( a, b ) => ( b.length - a.length ) || ( a[ 0 ] - b[ 0 ] ) );
}

/**
 * Decide whether the cohort splits into a dominant shape plus alternatives.
 *
 * Returns null when the skeleton should be built from every article: when the
 * cohort did not split at all, when the alternatives are all one-offs, or when
 * the largest group is too small or too thin a majority to speak for the type.
 *
 * @param {Array<number[]>} clusters Result of clusterByStructure
 * @param {number} total Number of articles in the cohort
 * @return {{ members: number[], others: Array<number[]> }|null}
 */
function dominantArchetype( clusters, total ) {
	if ( clusters.length < 2 ) {
		return null;
	}
	const largest = clusters[ 0 ];
	const others = clusters.slice( 1 )
		.filter( ( group ) => group.length >= MIN_REPORTED_MEMBERS );
	if ( others.length === 0 ) {
		return null;
	}
	if ( largest.length < MIN_DOMINANT_MEMBERS ||
		largest.length < Math.ceil( total * MIN_DOMINANT_SHARE )
	) {
		return null;
	}
	return { members: largest, others: others };
}

module.exports = {
	clusterByStructure,
	dominantArchetype
};
