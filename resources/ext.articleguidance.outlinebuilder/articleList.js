'use strict';

/**
 * Maintains the list of example articles the outline is generated from.
 *
 * The list is built up from three sources (type search, wiki category, single
 * title), each usable any number of times, so the same article can be offered
 * more than once. Merging keeps the list stable: existing rows never move and
 * never change source, and only genuinely new rows are reported back to the
 * caller so it can select them.
 */

/**
 * Add rows to the list, skipping ones already present.
 *
 * De-duplication is on title first, then on item. Title is the stronger key: the
 * same article reached through two sources can carry different item values (a
 * verified search result carries its Wikidata Q ID, an article with no Wikidata
 * item carries a title-derived placeholder). Item is still checked so a title
 * the wiki renders two ways cannot slip a duplicate through.
 *
 * @param {Array} existing Current rows
 * @param {Array} incoming Rows to add
 * @param {Object} source Provenance stamped on new rows: { key, name }, where key
 *   is 'type', 'category' or 'manual' and name is the category title (or empty)
 * @return {{ articles: Array, addedItems: string[] }} The new list, and the item
 *   values of the rows that were actually added
 */
function mergeArticles( existing, incoming, source ) {
	const haveTitles = new Set( existing.map( ( article ) => article.title ) );
	const haveItems = new Set( existing.map( ( article ) => article.item ) );
	const articles = existing.slice();
	const addedItems = [];

	incoming.forEach( ( row ) => {
		if ( haveTitles.has( row.title ) || haveItems.has( row.item ) ) {
			return;
		}
		haveTitles.add( row.title );
		haveItems.add( row.item );
		articles.push( Object.assign( {}, row, { source: source } ) );
		addedItems.push( row.item );
	} );

	return { articles: articles, addedItems: addedItems };
}

module.exports = {
	mergeArticles
};
