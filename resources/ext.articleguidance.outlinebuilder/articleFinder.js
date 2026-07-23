'use strict';

/**
 * Orchestrates finding good, language-native example articles of a type, to seed
 * an outline. All fast Action API, no WDQS.
 *
 * Wikidata instance-of typing is too inconsistent to enumerate a type's articles
 * directly: an exact `haswbstatement:P31=<type>` misses the notable ones (famous
 * books are typed "literary work", not "book"), while the P31/P279* subclass
 * closure is both slow and polluted (it threads e.g. cryptocurrencies under
 * "book"). So instead we key off the article's infobox — the human-maintained,
 * language-native, unambiguous type marker.
 *
 * Primary path:
 *   1. Resolve the type to the target wiki's infobox template. Prefer Wikidata's
 *      "topic's main template" (P1424) filtered to actual infoboxes (P31 =
 *      INFOBOX_TEMPLATE_CLASS); when that is absent (Wikidata often doesn't link
 *      it), detect it from a sample of on-type articles — the most common
 *      transcluded template that is a Wikidata infobox item.
 *   2. `hastemplate:"<infobox>"` search, ranked by the wiki's own relevance
 *      (pageview-derived popularity), so the most-developed articles surface
 *      first — exactly the well-developed exemplars we want.
 *
 * Fallbacks, in order, when the infobox path yields too few (types with no
 * consistent infobox): the local category tree (P910 anchor → descend to leaf
 * categories → `incategory` popularity harvest), then a `haswbstatement` seed
 * search. Results are ranked quality-first (badge, then size / structure) and
 * articles defined more specifically by a competitor outline are dropped.
 */

const {
	searchByStatement,
	fetchItemDetails,
	fetchItemsBadges,
	fetchTypeMainCategory,
	fetchTypeMainTemplate,
	fetchInstanceOf,
	INFOBOX_TEMPLATE_CLASS,
	BADGE_FEATURED,
	BADGE_GOOD
} = require( './api/Wikidata.js' );
const {
	fetchPageDetails,
	articleUrl,
	fetchCategoryInfo,
	fetchSubcategories,
	searchInCategory,
	searchByTemplate,
	fetchArticleTemplates,
	fetchWikibaseItems,
	getSiteId
} = require( './api/Wikipedia.js' );
const {
	propForMatchVia,
	groupByMatchVia,
	selectCompetitors
} = require( './outlineMapping.js' );

// Wikidata caps anonymous search and wbgetentities at 50.
const PAGE_SIZE = 50;

// Category-tree walk tuning.
const DESCENT_MAX_DEPTH = 4; // how deep to descend from the anchor category
const DESCENT_BREADTH = 20; // subcategory-bearing categories to expand per level
const SUBCATS_PER_CATEGORY = 15; // subcategories fetched per expanded category
const MAX_FRONTIER = 40; // cap the categories carried to the next depth level
const MAX_CATEGORY_VISITS = 90; // total categories we run categoryinfo on
const MIN_LEAF_ARTICLES = 5; // a category worth harvesting has at least this many pages
// A harvestable leaf is near-terminal: it holds articles but is not an
// organizational bucket of subcategories. Shallow "meta" categories (e.g.
// "Genre et forme littéraire") have many subcategories and hold articles *about*
// the topic (genres), not instances of it — so we descend past them instead.
const MAX_LEAF_SUBCATS = 3;
const TARGET_LEAF_CATEGORIES = 12; // harvest categories to collect

// Harvest tuning.
const PER_CATEGORY = 20; // members fetched per leaf category
const CANDIDATE_CAP = 50; // keep verification to one wbgetentities batch

// Infobox detection tuning.
const SAMPLE_SIZE = 15; // on-type articles sampled to detect the infobox
const MIN_SAMPLE = 5; // top up the sample from seeds below this
const DETECT_SHARED_FRACTION = 0.3; // a candidate template appears in this share of the sample
const DETECT_MAX_CANDIDATES = 100; // cap resolved templates (two wbgetentities batches)

// Quality ranking. The category harvest is noisy (meta pages, lists, stubs), so
// results are ranked by how developed each article is — an outline only needs a
// few strong examples. A "developed" article clears a size and structure floor;
// thinner pages are kept only to fill the requested count.
const SIZE_CAP = 200000; // clamp byte length so one huge article can't dominate
const SECTION_WEIGHT = 2000; // each section is worth this many "bytes" of score
const REFERENCE_WEIGHT = 500; // each reference is worth this many "bytes" of score
const MIN_ARTICLE_BYTES = 3000; // below this (and unbadged) an article is a stub
const MIN_ARTICLE_SECTIONS = 2; // lead + at least one heading

// Seed fallback tuning.
const SEED_TARGET = 40;
const SEED_MAX_PAGES = 8;

/**
 * Article quality from sitelink badges: a sort rank (featured 2 > good 1 > 0)
 * and a display code.
 *
 * @param {string[]} badges Sitelink badge Q IDs
 * @return {{ rank: number, quality: string }}
 */
function qualityOf( badges ) {
	if ( badges.includes( BADGE_FEATURED ) ) {
		return { rank: 2, quality: 'featured' };
	}
	if ( badges.includes( BADGE_GOOD ) ) {
		return { rank: 1, quality: 'good' };
	}
	return { rank: 0, quality: '' };
}

/**
 * Score how developed an article is, for quality-first ranking. A quality badge
 * (featured/good) dominates; otherwise byte length drives the score, with
 * structure (sections) and sourcing (references) as boosts.
 *
 * @param {Object} article Row with quality, sizeBytes, sections, references
 * @return {number}
 */
function qualityScore( article ) {
	const badgeRank = article.quality === 'featured' ? 2 :
		( article.quality === 'good' ? 1 : 0 );
	const size = article.sizeBytes !== null && article.sizeBytes !== undefined ?
		Math.min( article.sizeBytes, SIZE_CAP ) : 0;
	const sections = article.sections || 0;
	const references = article.references || 0;
	return badgeRank * 1e9 + size + sections * SECTION_WEIGHT + references * REFERENCE_WEIGHT;
}

/**
 * Whether an article is a stub: too short and too flat,
 * and not redeemed by a quality badge. Pages with no fetched details are not
 * treated as stubs (we lack the evidence to demote them).
 *
 * @param {Object} article Row with quality, sizeBytes, sections
 * @return {boolean}
 */
function isStub( article ) {
	if ( article.quality ) {
		return false;
	}
	if ( article.sizeBytes === null || article.sizeBytes === undefined ) {
		return false;
	}
	return article.sizeBytes < MIN_ARTICLE_BYTES ||
		( article.sections || 0 ) < MIN_ARTICLE_SECTIONS;
}

/**
 * Whether an item is defined more specifically by a competitor outline, judged
 * on direct statements.
 *
 * @param {Object} claims Map of prop → Set of value Q IDs
 * @param {Object} competitorGroups Map of matchVia key → competitor articleType[]
 * @return {boolean}
 */
function isMoreSpecific( claims, competitorGroups ) {
	return Object.keys( competitorGroups ).some( ( key ) => {
		const prop = propForMatchVia( key === 'default' ? null : key );
		const values = claims[ prop ];
		if ( !values ) {
			return false;
		}
		return competitorGroups[ key ].some( ( type ) => values.has( type ) );
	} );
}

/**
 * Build a result row from a verified item detail.
 *
 * @param {string} qid
 * @param {Object} detail Result of fetchItemDetails for the item
 * @return {Object}
 */
function toResult( qid, detail ) {
	return {
		item: qid,
		title: detail.title,
		url: detail.url,
		quality: qualityOf( detail.badges ).quality
	};
}

/**
 * Walk down from the anchor category to near-terminal leaf categories that hold
 * instances of the type (articles, not subcategories).
 *
 * Breadth-first, bounded on depth, per-level breadth, next-level frontier size
 * and total categories inspected, so the number of API calls stays small. A
 * category is harvested when it is near-terminal (enough articles, few
 * subcategories); anything with more subcategories is an organizational bucket
 * and is descended instead. Subcategories of the expanded parents are
 * interleaved round-robin so one large bucket (e.g. "by year") does not crowd
 * out the others.
 *
 * @param {string} anchor Anchor category title (with namespace prefix)
 * @return {Promise<string[]>} Leaf category titles worth harvesting
 */
async function collectHarvestCategories( anchor ) {
	const visited = new Set( [ anchor ] );
	let frontier = [ anchor ];
	const leaves = [];
	let visits = 0;

	for ( let depth = 0; depth <= DESCENT_MAX_DEPTH; depth++ ) {
		if ( frontier.length === 0 || leaves.length >= TARGET_LEAF_CATEGORIES ||
			visits >= MAX_CATEGORY_VISITS ) {
			break;
		}
		const batch = frontier.slice( 0, MAX_CATEGORY_VISITS - visits );
		visits += batch.length;
		const info = await fetchCategoryInfo( batch );

		const toDescend = [];
		batch.forEach( ( category ) => {
			const ci = info[ category ];
			if ( !ci ) {
				return;
			}
			const isLeaf = ci.pages >= MIN_LEAF_ARTICLES && ci.subcats <= MAX_LEAF_SUBCATS;
			if ( isLeaf ) {
				if ( !leaves.includes( category ) ) {
					leaves.push( category );
				}
			} else if ( ci.subcats > 0 ) {
				toDescend.push( category );
			}
		} );

		if ( leaves.length >= TARGET_LEAF_CATEGORIES || depth === DESCENT_MAX_DEPTH ) {
			break;
		}

		const parents = toDescend.slice( 0, DESCENT_BREADTH );
		const subLists = await Promise.all(
			parents.map(
				( parent ) => fetchSubcategories( parent, SUBCATS_PER_CATEGORY )
			)
		);
		const maxLength = subLists.reduce( ( max, list ) => Math.max( max, list.length ), 0 );
		const next = [];
		for ( let rank = 0; rank < maxLength && next.length < MAX_FRONTIER; rank++ ) {
			for ( let i = 0; i < subLists.length && next.length < MAX_FRONTIER; i++ ) {
				const list = subLists[ i ];
				if ( rank < list.length && !visited.has( list[ rank ] ) ) {
					visited.add( list[ rank ] );
					next.push( list[ rank ] );
				}
			}
		}
		frontier = next;
	}

	return leaves.slice( 0, TARGET_LEAF_CATEGORIES );
}

/**
 * Harvest article titles from the categories, popularity-ranked, merged
 * round-robin by within-category rank so the most popular of each interleave.
 *
 * @param {string[]} categories
 * @param {number} cap Maximum candidate titles
 * @return {Promise<string[]>} Candidate titles
 */
async function harvestByPopularity( categories, cap ) {
	const lists = await Promise.all(
		categories.map( ( category ) => searchInCategory( category, PER_CATEGORY ) )
	);
	const maxLength = lists.reduce( ( max, list ) => Math.max( max, list.length ), 0 );
	const merged = [];
	const seen = new Set();
	for ( let rank = 0; rank < maxLength && merged.length < cap; rank++ ) {
		for ( let i = 0; i < lists.length && merged.length < cap; i++ ) {
			const list = lists[ i ];
			if ( rank < list.length ) {
				const title = list[ rank ];
				if ( !seen.has( title ) ) {
					seen.add( title );
					merged.push( title );
				}
			}
		}
	}
	return merged;
}

/**
 * Detect a type's infobox template from a sample of its articles: the most
 * common transcluded template whose Wikidata item is an infobox
 * (INFOBOX_TEMPLATE_CLASS). Checking the Wikidata class — rather than the
 * template name — keeps this language-agnostic and isolates the real infobox
 * from ubiquitous maintenance templates (authority control, dates, portals).
 *
 * @param {string[]} sampleTitles On-type article titles
 * @return {Promise<string|null>} Infobox template title, or null when none stands out
 */
async function detectInfobox( sampleTitles ) {
	if ( sampleTitles.length === 0 ) {
		return null;
	}
	const templatesByArticle = await fetchArticleTemplates( sampleTitles );
	const articles = Object.keys( templatesByArticle );
	if ( articles.length === 0 ) {
		return null;
	}
	const counts = {};
	articles.forEach( ( article ) => {
		// Dedupe per article so one article can't inflate a template's count.
		const unique = new Set( templatesByArticle[ article ] );
		unique.forEach( ( template ) => {
			counts[ template ] = ( counts[ template ] || 0 ) + 1;
		} );
	} );

	// Templates shared by a fair share of the sample. The infobox is among them,
	// but so are generic maintenance templates (authority control, portals, date
	// helpers) — which always out-number the infobox, so we must NOT pre-truncate
	// to a small top-N. Instead we resolve the whole shared set and let the
	// Wikidata infobox class pick the winner.
	const threshold = Math.max( 2, Math.ceil( articles.length * DETECT_SHARED_FRACTION ) );
	const shared = Object.keys( counts )
		.filter( ( template ) => counts[ template ] >= threshold )
		.sort( ( a, b ) => counts[ b ] - counts[ a ] )
		.slice( 0, DETECT_MAX_CANDIDATES );
	if ( shared.length === 0 ) {
		return null;
	}

	const titleToItem = await fetchWikibaseItems( shared );
	const itemQids = [];
	const seen = new Set();
	shared.forEach( ( template ) => {
		const qid = titleToItem[ template ];
		if ( qid && !seen.has( qid ) ) {
			seen.add( qid );
			itemQids.push( qid );
		}
	} );
	const instanceOf = {};
	for ( let i = 0; i < itemQids.length; i += PAGE_SIZE ) {
		const batch = await fetchInstanceOf( itemQids.slice( i, i + PAGE_SIZE ) );
		Object.keys( batch ).forEach( ( qid ) => {
			instanceOf[ qid ] = batch[ qid ];
		} );
	}

	// `shared` is ordered by frequency, so the first infobox is the dominant one.
	let infobox = null;
	shared.some( ( template ) => {
		const qid = titleToItem[ template ];
		if ( qid && instanceOf[ qid ] && instanceOf[ qid ].has( INFOBOX_TEMPLATE_CLASS ) ) {
			infobox = template;
			return true;
		}
		return false;
	} );
	return infobox;
}

/**
 * Resolve candidate titles to Wikidata items and drop any defined more
 * specifically by a competitor outline. Titles with no resolvable item (or no
 * claims) are kept — they come from a curated on-topic category, so absence of
 * Wikidata data is not evidence against them. Input order is preserved.
 *
 * @param {string[]} titles Candidate titles, in the desired order
 * @param {string} focusProperty
 * @param {string} typeQId
 * @param {Object} competitorGroups
 * @param {string[]} claimProps
 * @param {boolean} requireFocusValue Keep only items whose focus property
 *   (e.g. P106 occupation) includes the type — for types with a generic infobox
 * @return {Promise<Array>} Result rows, in input order
 */
async function filterCandidates(
	titles, focusProperty, typeQId, competitorGroups, claimProps, requireFocusValue
) {
	if ( titles.length === 0 ) {
		return [];
	}
	const titleToItem = await fetchWikibaseItems( titles );
	const qids = [];
	const seenQid = new Set();
	titles.forEach( ( title ) => {
		const qid = titleToItem[ title ];
		if ( qid && !seenQid.has( qid ) ) {
			seenQid.add( qid );
			qids.push( qid );
		}
	} );
	// When verifying the focus property, make sure it is among the fetched claims.
	const fetchProps = claimProps.slice();
	if ( requireFocusValue && !fetchProps.includes( focusProperty ) ) {
		fetchProps.push( focusProperty );
	}
	const details = qids.length ?
		await fetchItemDetails(
			qids.slice( 0, PAGE_SIZE ), await getSiteId(), fetchProps
		) : {};

	const results = [];
	const seenTitle = new Set();
	titles.forEach( ( title ) => {
		if ( seenTitle.has( title ) ) {
			return;
		}
		seenTitle.add( title );
		const qid = titleToItem[ title ];
		const detail = qid ? details[ qid ] : null;
		if ( detail ) {
			if ( isMoreSpecific( detail.claims, competitorGroups ) ) {
				return;
			}
			// For occupation / taxon types (non-default matchVia) the wiki's infobox
			// is generic (e.g. {{Infobox person}} covers every biography), so the
			// harvest must be verified against the type's focus property.
			if ( requireFocusValue ) {
				const focusValues = detail.claims[ focusProperty ];
				if ( !( focusValues && focusValues.has( typeQId ) ) ) {
					return;
				}
			}
			results.push( toResult( qid, detail ) );
		} else if ( !requireFocusValue ) {
			// Keep an unresolved title only when we are not verifying the type.
			results.push( {
				item: qid || ( 'title:' + title ),
				title: title,
				url: articleUrl( title ),
				quality: ''
			} );
		}
	} );
	return results;
}

/**
 * Gather on-type seed items that exist on the target wiki, by paging the
 * Wikidata haswbstatement search. Fallback path for types with no usable
 * category tree.
 *
 * @param {string} focusProperty
 * @param {string} typeQId
 * @param {Object} competitorGroups
 * @param {string[]} claimProps
 * @param {number} target Desired seed count
 * @return {Promise<Array>} Seed result rows
 */
async function gatherSeeds(
	focusProperty, typeQId, competitorGroups, claimProps, target
) {
	const seeds = [];
	let offset = 0;
	let page = 0;
	while ( seeds.length < target && page < SEED_MAX_PAGES ) {
		const search = await searchByStatement( focusProperty, typeQId, PAGE_SIZE, offset );
		if ( search.ids.length === 0 ) {
			break;
		}
		const details = await fetchItemDetails(
			search.ids, await getSiteId(), claimProps
		);
		search.ids.forEach( ( qid ) => {
			const detail = details[ qid ];
			if ( detail && !isMoreSpecific( detail.claims, competitorGroups ) ) {
				seeds.push( toResult( qid, detail ) );
			}
		} );
		if ( search.nextOffset === null ) {
			break;
		}
		offset = search.nextOffset;
		page++;
	}
	return seeds;
}

/**
 * Find example articles of a type on a wiki, language-native and
 * popularity-ranked.
 *
 * @param {string} typeQId Wikidata Q ID of the article type
 * @param {string|null} matchVia Target matchVia (null = default P31 strategy)
 * @param {number} hierarchyDepth Target type hierarchy depth
 * @param {Array} outlines All outline objects (for specificity ranking)
 * @param {number} limit Maximum number of articles to return
 * @return {Promise<Array>} Array of
 *   { item, title, url, quality, sizeBytes, references, sections, lastUpdated }
 */
async function findExampleArticles( typeQId, matchVia, hierarchyDepth, outlines, limit ) {
	const focusProperty = propForMatchVia( matchVia );
	const competitorGroups = groupByMatchVia(
		selectCompetitors( outlines, typeQId, hierarchyDepth, matchVia )
	);
	const claimProps = Object.keys( competitorGroups )
		.map( ( key ) => propForMatchVia( key === 'default' ? null : key ) )
		.filter( ( prop, index, arr ) => arr.indexOf( prop ) === index );

	// Occupation / taxon types (non-default matchVia) share a generic wiki infobox
	// ({{Infobox person}}, {{Speciesbox}}), so infobox/category harvests must be
	// verified against the type's focus property. Default (P31) types have a
	// type-specific infobox and must NOT be verified (their notable instances are
	// often not typed as the type itself — e.g. books typed as "literary work").
	const requireFocusValue = Boolean( matchVia );

	const results = [];

	// Merge new result rows into `results`, de-duping on item and title.
	const merge = ( rows ) => {
		const haveItems = new Set( results.map( ( result ) => result.item ) );
		const haveTitles = new Set( results.map( ( result ) => result.title ) );
		rows.forEach( ( row ) => {
			if ( !haveItems.has( row.item ) && !haveTitles.has( row.title ) ) {
				haveItems.add( row.item );
				haveTitles.add( row.title );
				results.push( row );
			}
		} );
	};

	// The category-tree harvest doubles as the infobox-detection sample and as a
	// fallback, so compute it at most once.
	let categoryCandidates = null;
	const getCategoryCandidates = async () => {
		if ( categoryCandidates === null ) {
			categoryCandidates = [];
			try {
				const anchor = await fetchTypeMainCategory( typeQId, await getSiteId() );
				if ( anchor ) {
					const categories = await collectHarvestCategories( anchor );
					if ( categories.length > 0 ) {
						categoryCandidates = await harvestByPopularity(
							categories, CANDIDATE_CAP
						);
					}
				}
			} catch ( e ) {
				categoryCandidates = [];
			}
		}
		return categoryCandidates;
	};

	// haswbstatement seeds are used both to top up a thin detection sample and as
	// the last-resort fallback, so compute them at most once.
	let seedRows = null;
	const getSeeds = async () => {
		if ( seedRows === null ) {
			try {
				seedRows = await gatherSeeds(
					focusProperty, typeQId, competitorGroups, claimProps, SEED_TARGET
				);
			} catch ( e ) {
				seedRows = [];
			}
		}
		return seedRows;
	};

	// Primary: the type's infobox template. Prefer P1424; else detect from a
	// sample of on-type articles (category harvest, topped up with seeds).
	try {
		let infobox = await fetchTypeMainTemplate( typeQId, await getSiteId() );
		if ( !infobox ) {
			let sample = ( await getCategoryCandidates() ).slice( 0, SAMPLE_SIZE );
			if ( sample.length < MIN_SAMPLE ) {
				const seedTitles = ( await getSeeds() ).map( ( seed ) => seed.title );
				sample = sample.concat( seedTitles ).slice( 0, SAMPLE_SIZE );
			}
			infobox = await detectInfobox( sample );
		}
		if ( infobox ) {
			const titles = await searchByTemplate( infobox, CANDIDATE_CAP );
			if ( titles.length > 0 ) {
				merge( await filterCandidates(
					titles, focusProperty, typeQId,
					competitorGroups, claimProps, requireFocusValue
				) );
			}
		}
	} catch ( e ) {
		// The fallbacks below find the articles
	}

	// Fallback: the category-tree harvest itself.
	if ( results.length < limit ) {
		try {
			const candidateTitles = await getCategoryCandidates();
			if ( candidateTitles.length > 0 ) {
				merge( await filterCandidates(
					candidateTitles, focusProperty, typeQId,
					competitorGroups, claimProps, requireFocusValue
				) );
			}
		} catch ( e ) {
			// keep what we have
		}
	}

	// Fallback: haswbstatement seeds.
	if ( results.length < limit ) {
		merge( await getSeeds() );
	}

	// Fetch details for the whole pool so redirects / missing / empty pages can be
	// excluded, and so size / structure are available for quality ranking.
	// Best-effort: if the fetch fails entirely, keep the items rather than hiding all.
	let pageDetails = {};
	try {
		pageDetails = await fetchPageDetails( results.map( ( result ) => result.title ) );
	} catch ( e ) {
		pageDetails = {};
	}

	const articles = [];
	results.forEach( ( result ) => {
		const detail = pageDetails[ result.title ];
		if ( detail && !detail.isArticle ) {
			return;
		}
		articles.push( {
			item: result.item,
			title: result.title,
			url: result.url,
			quality: result.quality,
			sizeBytes: detail && detail.size !== undefined ? detail.size : null,
			references: detail && detail.references !== undefined ? detail.references : null,
			sections: detail && detail.sections !== undefined ? detail.sections : null,
			lastUpdated: detail && detail.lastUpdated !== undefined ? detail.lastUpdated : null
		} );
	} );

	// Quality-first: developed articles before stubs, then by quality score.
	// Stubs (short, flat, unbadged meta/list pages) survive only to fill the count.
	articles.sort( ( a, b ) => {
		const stubDiff = ( isStub( a ) ? 1 : 0 ) - ( isStub( b ) ? 1 : 0 );
		return stubDiff !== 0 ? stubDiff : qualityScore( b ) - qualityScore( a );
	} );

	return articles.slice( 0, limit );
}

/**
 * Normalize a title for comparison, the way the Action API canonicalizes it:
 * underscores become spaces and the first letter is capitalized.
 *
 * @param {string} title
 * @return {string}
 */
function titleKey( title ) {
	const spaced = title.replace( /_/g, ' ' ).trim();
	return spaced.charAt( 0 ).toUpperCase() + spaced.slice( 1 );
}

/**
 * Fetch articles by title, filling the same fields the search path produces.
 * Used by the add-by-category and add-by-title paths, which start from titles
 * rather than from Wikidata items.
 *
 * The whole set is fetched in two batched steps (page details, then badges), so
 * adding many articles at once costs a constant number of requests. Titles that
 * are not articles (redirects, missing, empty) are dropped. The API canonicalizes
 * titles, so a row's title is the one the wiki reports, not the one asked for.
 *
 * @param {string[]} titles Article titles
 * @return {Promise<Array>} Array of { item, title, url, quality, sizeBytes,
 *   references, sections, lastUpdated }
 */
async function fetchArticlesByTitles( titles ) {
	if ( titles.length === 0 ) {
		return [];
	}
	const detailsMap = await fetchPageDetails( titles );

	// fetchPageDetails keys on the canonical title and returns pages in page-id
	// order, so walk the requested titles instead: the category harvest orders
	// them by readership and that order is worth keeping. Titles are matched
	// loosely because the API canonicalizes them (underscores, first letter).
	const canonicalByKey = {};
	Object.keys( detailsMap ).forEach( ( title ) => {
		canonicalByKey[ titleKey( title ) ] = title;
	} );
	const found = [];
	const seen = new Set();
	titles.forEach( ( requested ) => {
		const title = detailsMap[ requested ] !== undefined ?
			requested :
			canonicalByKey[ titleKey( requested ) ];
		if ( title === undefined || seen.has( title ) || !detailsMap[ title ].isArticle ) {
			return;
		}
		seen.add( title );
		found.push( title );
	} );

	// Badges decide the quality column. They are a nicety, so a failure here
	// leaves the column blank rather than failing the whole add.
	let badgesByItem = {};
	const qIds = found
		.map( ( title ) => detailsMap[ title ].wikibaseItem )
		.filter( ( qId ) => Boolean( qId ) );
	if ( qIds.length > 0 ) {
		try {
			badgesByItem = await fetchItemsBadges( qIds, await getSiteId() );
		} catch ( e ) {
			badgesByItem = {};
		}
	}

	return found.map( ( title ) => {
		const detail = detailsMap[ title ];
		const badges = ( detail.wikibaseItem && badgesByItem[ detail.wikibaseItem ] ) || [];
		return {
			// Articles without a Wikidata item still need a stable row key.
			item: detail.wikibaseItem || ( 'title:' + title ),
			title: title,
			url: articleUrl( title ),
			quality: qualityOf( badges ).quality,
			sizeBytes: detail.size !== undefined ? detail.size : null,
			references: detail.references !== undefined ? detail.references : null,
			sections: detail.sections !== undefined ? detail.sections : null,
			lastUpdated: detail.lastUpdated !== undefined ? detail.lastUpdated : null
		};
	} );
}

/**
 * Find the articles of a wiki category, most-read first.
 *
 * Direct members come from `incategory:` search, which is non-recursive and
 * ranked by the wiki's default relevance (CirrusSearch folds in a
 * pageview-derived popularity score). With subcategories included, the category
 * and its direct subcategories are harvested together and interleaved
 * round-robin, so one large subcategory cannot crowd out the others.
 *
 * @param {string} categoryTitle Category title (with or without namespace prefix)
 * @param {number} limit Maximum articles
 * @param {boolean} includeSubcategories Harvest the direct subcategories too
 * @return {Promise<Array>} Result rows, as fetchArticlesByTitles produces
 */
async function findArticlesInCategory( categoryTitle, limit, includeSubcategories ) {
	let titles;
	if ( includeSubcategories ) {
		let categories = [ categoryTitle ];
		try {
			categories = categories.concat(
				await fetchSubcategories( categoryTitle, SUBCATS_PER_CATEGORY )
			);
		} catch ( e ) {
			// Harvest the category alone if its subcategories cannot be listed.
		}
		titles = await harvestByPopularity( categories, limit );
	} else {
		titles = await searchInCategory( categoryTitle, limit );
	}
	return fetchArticlesByTitles( titles.slice( 0, limit ) );
}

module.exports = {
	findExampleArticles,
	findArticlesInCategory,
	fetchArticlesByTitles
};
