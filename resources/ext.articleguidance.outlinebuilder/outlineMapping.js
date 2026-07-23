'use strict';

const PROP_INSTANCE_OF = 'P31';

/**
 * The Wikidata property that carries the article-type value for a given matchVia
 * strategy: the default strategy uses P31 (instance of); any other matchVia
 * (e.g. P106 occupation, P171 parent taxon) uses that property directly.
 *
 * Mirrors propForGroup() in
 * ext.articleguidance.newarticle/composables/outlineMatching.js, minus the
 * P279 subclass path (this builder matches on direct statements via
 * haswbstatement, not hierarchy traversal).
 *
 * @param {string|null} matchVia Outline matchVia, or null for the default strategy
 * @return {string} Property ID
 */
function propForMatchVia( matchVia ) {
	return matchVia || PROP_INSTANCE_OF;
}

/**
 * Group outlines by their matchVia strategy.
 *
 * Same grouping as groupOutlinesByMatchVia() in
 * ext.articleguidance.newarticle/composables/outlineMatching.js, but for flat
 * type entries (see toTypeEntries()) instead of outlines with articleTypes.
 *
 * @param {Array} outlines Type entries with articleType and optional matchVia
 * @return {Object} Map of matchVia key ('default' | 'P106' | ...) → articleType[]
 */
function groupByMatchVia( outlines ) {
	return outlines.reduce( ( groups, outline ) => {
		const key = outline.matchVia || 'default';
		if ( !groups[ key ] ) {
			groups[ key ] = [];
		}
		groups[ key ].push( outline.articleType );
		return groups;
	}, {} );
}

/**
 * Select the outlines that would rank *more specifically* than the target type,
 * i.e. outlines that would claim an item ahead of the target type in the
 * new-article search.
 *
 * Derived (inverted) from selectBestMatches() in
 * ext.articleguidance.newarticle/composables/outlineMatching.js, which ranks an
 * item's candidate outlines in two tiers:
 *   1. prefer a non-default matchVia over the default P31/P279 strategy;
 *   2. within the surviving tier, keep only the greatest hierarchy depth.
 * Reversing that, another outline out-ranks the target type when:
 *   - the target uses the default strategy and the other does not (any depth), or
 *   - both are in the same tier and the other is strictly deeper.
 * An item matching any such outline is defined more specifically elsewhere and is
 * dropped from this type's list.
 *
 * @param {Array} outlines All outline objects (articleType, matchVia, hierarchyDepth)
 * @param {string} typeQId Target article type Q ID
 * @param {number} typeDepth Target type hierarchy depth
 * @param {string|null} typeMatchVia Target type matchVia (null = default strategy)
 * @return {Array} Outlines that would out-rank the target type
 */
function selectCompetitors( outlines, typeQId, typeDepth, typeMatchVia ) {
	const targetIsDefault = !typeMatchVia;
	return outlines.filter( ( outline ) => {
		if ( !outline.articleType || outline.articleType === typeQId ) {
			return false;
		}
		const outlineIsDefault = !outline.matchVia;
		const outlineDepth = outline.hierarchyDepth || 0;
		if ( targetIsDefault ) {
			// A non-default strategy wins outright; a default outline wins only if deeper.
			return !outlineIsDefault || outlineDepth > typeDepth;
		}
		// Target is non-default: only a strictly deeper non-default outline out-ranks it.
		return !outlineIsDefault && outlineDepth > typeDepth;
	} );
}

/**
 * Make one entry for each type of each outline, because specificity is ranked
 * per article type. The server gives a Q ID to one outline only, and a generic
 * outline has no types.
 *
 * @param {Array} outlines Outlines from the REST API
 * @return {Array} Entries (articleType, matchVia, hierarchyDepth) for selectCompetitors()
 */
function toTypeEntries( outlines ) {
	return outlines.reduce(
		( entries, outline ) => entries.concat(
			outline.articleTypes.map( ( typeEntry ) => ( {
				articleType: typeEntry.id,
				matchVia: typeEntry.matchVia,
				hierarchyDepth: typeEntry.hierarchyDepth
			} ) )
		),
		[]
	);
}

module.exports = {
	propForMatchVia,
	groupByMatchVia,
	selectCompetitors,
	toTypeEntries
};
