'use strict';

/**
 * Builds the wikitext of an outline page from a set of selected example
 * articles, by extracting what they have in common:
 * section headings, the infobox template and its commonly-filled fields, the
 * most common category, and the domains that their references cite most.
 *
 * The lead sentence is derived by slotting each example's own infobox values
 * out of its opening sentence, so the shared wording remains and the
 * type-specific facts become named placeholders.
 *
 * The skeleton is built from the largest group of structurally similar examples
 * (see archetypes.js) rather than from the whole cohort, so a type that holds
 * several kinds of page does not produce a skeleton no single page has.
 *
 * All aggregation is deterministic (no LLM). The output mirrors the format of
 * the hand-authored outlines in outlines/*.txt: an <article-guidance> tag block
 * followed by an article skeleton (infobox, lead, == sections ==, references).
 * It is a maintainer-reviewed draft, so the wikitext parsing here is deliberately
 * approximate.
 */

const { fetchWikitext, getCategoryNames } = require( './api/Wikipedia.js' );
const { clusterByStructure, dominantArchetype } = require( './archetypes.js' );

// A dimension is kept when it appears in at least this fraction of the articles.
const SECTION_THRESHOLD = 0.5;
const INFOBOX_FIELD_THRESHOLD = 0.5;
// Short description, date format and coordinate templates have fewer named
// parameters than an infobox.
const MIN_INFOBOX_PARAMS = 3;

// Sources listed in the tag block. The union across a cohort runs to dozens of
// domains, and a list that long is not reviewable, so only the most cited are
// written out.
const MAX_SOURCE_DOMAINS = 10;
// A domain that one article cites tells nothing about the type
const MIN_SOURCE_ARTICLES = 2;
// Hosts that link to a copy or an identifier, not to the publisher
const LINK_TOOL_HOSTS = [
	'archive.org', 'archive.today', 'archive.ph', 'archive.is', 'doi.org', 'handle.net',
	'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'wikisource.org'
];

// Lead-sentence slotting.
// A value shorter than this is too common a string to replace safely ("US",
// "art"); four characters also admits a bare year.
const MIN_SLOT_VALUE_CHARS = 4;
// Infobox fields that never appear in prose, so a match against them is noise.
const NON_PROSE_FIELD_RE = /image|photo|caption|logo|alt|map|size|width|pixels|file/i;
// A pattern needs the subject plus one fact to be worth offering, and must be
// shared by at least this many examples, and by this share of them, to count as
// the type's shared wording. A pattern a minority writes is not the type's.
const MIN_LEAD_SLOTS = 2;
const MIN_LEAD_SUPPORT = 2;
const MIN_LEAD_SUPPORT_SHARE = 0.3;
// Bounds on what counts as an opening sentence, guarding against a lead whose
// sentence break cannot be found.
const MIN_SENTENCE_CHARS = 25;
const MAX_SENTENCE_CHARS = 400;

// Nesting depth up to which innermost-first template stripping is repeated.
const TEMPLATE_STRIP_PASSES = 5;

// Reference-list markers — the <references> tag or a reflist-family template.
// Detecting the references section by its content (rather than its localized
// heading) keeps appendix handling language-independent.
const REFERENCES_MARKER_RE =
	/<references[\s/>]|\{\{\s*(?:reflist|references|référence|références|referencias|listaref|notelist|note ?list|reflista|przypisy|referències|refbegin)\b/i;

/**
 * Strip light wiki markup (bold/italic, links, tags) from heading text.
 *
 * @param {string} text
 * @return {string}
 */
function stripMarkup( text ) {
	return text
		.replace( /'''?/g, '' )
		.replace( /\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1' )
		.replace( /\[\[([^\]]*)\]\]/g, '$1' )
		.replace( /<[^>]+>/g, '' )
		.trim();
}

/**
 * Normalize a heading to a matching key: markup-stripped, lower-cased, trailing
 * punctuation removed, whitespace collapsed.
 *
 * @param {string} text
 * @return {string}
 */
function normalizeHeading( text ) {
	return stripMarkup( text )
		.toLowerCase()
		.replace( /[\s:.\-–—]+$/, '' )
		.replace( /\s+/g, ' ' )
		.trim();
}

/**
 * Remove templates, innermost first, so nested ones go too.
 *
 * @param {string} text
 * @return {string}
 */
function stripTemplates( text ) {
	let stripped = text;
	for ( let i = 0; i < TEMPLATE_STRIP_PASSES; i++ ) {
		stripped = stripped.replace( /\{\{[^{}]*\}\}/g, '' );
	}
	return stripped;
}

/**
 * Replace wikilinks with the text a reader sees, and drop links that only
 * position the page (files, categories, interwiki).
 *
 * A namespace prefix is told from a title that merely contains a colon by the
 * shape of the part before it: a prefix is one short word, so "[[File:X.jpg]]"
 * is dropped while "[[Star Trek: The Motion Picture]]" is kept.
 *
 * @param {string} text
 * @return {string}
 */
function flattenLinks( text ) {
	return text.replace( /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, ( full, target, display ) => {
		if ( /^\s*[^\s:]{1,20}\s*:/.test( target ) ) {
			return '';
		}
		return display !== undefined ? display : target;
	} );
}

/**
 * Reduce wikitext to the prose a reader sees: no comments, references, tables,
 * templates, links-as-markup, HTML tags, headings or magic words.
 *
 * @param {string} text
 * @return {string}
 */
function stripToProse( text ) {
	let prose = text
		.replace( /<!--[\s\S]*?-->/g, '' )
		.replace( /<ref\b[\s\S]*?<\/ref>/gi, '' )
		.replace( /<ref\b[^>]*\/>/gi, '' )
		.replace( /\{\|[\s\S]*?\|\}/g, '' );
	prose = stripTemplates( prose );
	return flattenLinks( prose )
		.replace( /<[^>]+>/g, '' )
		.replace( /^={2,}.*$/gm, '' )
		.replace( /^__[A-Z]+__$/gm, '' );
}

/**
 * Extract an article's level-2 sections, in document order, each with its
 * heading and body (the body includes any level-3+ subsections up to the next
 * level-2 heading).
 *
 * @param {string} wikitext
 * @return {Array<{ heading: string, body: string }>}
 */
function extractSectionData( wikitext ) {
	const sections = [];
	let current = null;
	wikitext.split( '\n' ).forEach( ( line ) => {
		const match = line.match( /^(={2,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/ );
		if ( match && match[ 1 ].length === 2 ) {
			const heading = stripMarkup( match[ 2 ] );
			current = heading !== '' ? { heading: heading, bodyLines: [] } : null;
			if ( current ) {
				sections.push( current );
			}
		} else if ( current ) {
			current.bodyLines.push( line );
		}
	} );
	return sections.map( ( section ) => ( {
		heading: section.heading,
		body: section.bodyLines.join( '\n' )
	} ) );
}

/**
 * Whether a section is the references section, judged by a reference-list marker
 * in its body (language-independent).
 *
 * @param {string} body
 * @return {boolean}
 */
function isReferencesSection( body ) {
	return REFERENCES_MARKER_RE.test( body );
}

/**
 * Whether a list item is essentially a bare link (a wikilink or external link
 * with little trailing text) — the shape of "See also" / "External links" items,
 * as opposed to data rows like a filmography ("[[Film]] (1972) as Role").
 *
 * @param {string} item List item text (bullet marker already removed)
 * @return {boolean}
 */
function isLinkOnly( item ) {
	if ( item === '' ) {
		// A list item that was only a template (stripped upstream): a {{cite}} /
		// {{Ouvrage}} bibliography entry or an external-link template.
		return true;
	}
	const stripped = item
		.replace( /^\[\[[^\]|]*(?:\|[^\]]*)?\]\]/, '' )
		.replace( /^\[https?:\/\/\S+[^\]]*\]/i, '' )
		.replace( /''+/g, '' )
		.trim();
	return item !== stripped && stripped.length <= 8;
}

/**
 * Whether a section is a link-list appendix ("See also", "External links",
 * "Articles connexes"…): its body is mostly bare-link bullets with little prose.
 * Templates, refs and comments are stripped first so the visible list is judged.
 *
 * @param {string} body
 * @return {boolean}
 */
function isLinkListSection( body ) {
	const text = stripTemplates( body
		.replace( /<!--[\s\S]*?-->/g, '' )
		.replace( /<ref\b[\s\S]*?<\/ref>/gi, '' )
		.replace( /<ref\b[^>]*\/>/gi, '' ) );
	const lines = text.split( '\n' )
		.map( ( line ) => line.trim() )
		.filter( ( line ) => line !== '' &&
			!/^={2,}/.test( line ) && // sub-headings
			!/^\[\[[^\]]*:[^\]]*\]\]$/.test( line ) && // trailing category / file / interwiki
			!/^__[A-Z]+__$/.test( line ) ); // magic words
	if ( lines.length === 0 ) {
		return false;
	}
	let listLines = 0;
	let linkOnly = 0;
	let proseLines = 0;
	lines.forEach( ( line ) => {
		if ( /^[*#:;]/.test( line ) ) {
			listLines++;
			if ( isLinkOnly( line.replace( /^[*#:;]+\s*/, '' ) ) ) {
				linkOnly++;
			}
		} else {
			proseLines++;
		}
	} );
	return listLines >= 2 && linkOnly >= Math.ceil( listLines * 0.6 ) && proseLines <= 1;
}

/**
 * Extract the names of the categories of an article.
 *
 * @param {string} wikitext
 * @param {string[]} namespaceNames Names of the category namespace of the wiki
 * @return {string[]}
 */
function extractCategories( wikitext, namespaceNames ) {
	const categories = [];
	const prefixes = namespaceNames
		.map( ( name ) => mw.util.escapeRegExp( name ).replace( /[ _]+/g, '[ _]+' ) )
		.join( '|' );
	const re = new RegExp(
		'\\[\\[\\s*(?:' + prefixes + ')\\s*:([^\\]|#]+)(?:#[^\\]|]*)?(?:\\|[^\\]]*)?\\]\\]',
		'gi'
	);
	let match;
	while ( ( match = re.exec( wikitext ) ) !== null ) {
		const name = match[ 1 ].trim();
		if ( name !== '' ) {
			categories.push( name );
		}
	}
	return categories;
}

/**
 * Reduce a URL to its host domain (lower-cased, without a leading "www.").
 *
 * @param {string} url
 * @return {string|null}
 */
function domainOf( url ) {
	const match = url.match( /^https?:\/\/([^/?#]+)/i );
	if ( !match ) {
		return null;
	}
	return match[ 1 ].replace( /^www\./i, '' ).toLowerCase();
}

/**
 * @param {string} domain
 * @return {boolean} Whether the domain is a link tool, which is not a source
 */
function isLinkTool( domain ) {
	return /^books\.google\./.test( domain ) || LINK_TOOL_HOSTS.some(
		( host ) => domain === host || domain.endsWith( '.' + host )
	);
}

/**
 * Extract the host domains of the URLs in the references. URLs outside the
 * references, such as external links and the subject's website, are not sources.
 *
 * @param {string} wikitext
 * @return {string[]}
 */
function extractReferenceDomains( wikitext ) {
	const domains = [];
	const refRe = /<ref\b[^>]*[^/>]>([\s\S]*?)<\/ref\s*>|<ref>([\s\S]*?)<\/ref\s*>/gi;
	const urlRe = /https?:\/\/[^\s|{}[\]<>"]+/gi;
	const text = wikitext.replace( /<!--[\s\S]*?-->/g, '' );
	let ref;
	while ( ( ref = refRe.exec( text ) ) !== null ) {
		const content = ref[ 1 ] !== undefined ? ref[ 1 ] : ref[ 2 ];
		let match;
		while ( ( match = urlRe.exec( content ) ) !== null ) {
			const domain = domainOf( match[ 0 ] );
			if ( domain && !isLinkTool( domain ) ) {
				domains.push( domain );
			}
		}
	}
	return domains;
}

/**
 * Find the end index (just past the closing `}}`) of the template that starts at
 * `start` (which must point at the opening `{{`).
 *
 * @param {string} text
 * @param {number} start
 * @return {number} End index, or -1 if unbalanced
 */
function findTemplateEnd( text, start ) {
	let depth = 0;
	for ( let i = start; i < text.length - 1; i++ ) {
		const two = text.slice( i, i + 2 );
		if ( two === '{{' ) {
			depth++;
			i++;
		} else if ( two === '}}' ) {
			depth--;
			i++;
			if ( depth === 0 ) {
				return i + 1;
			}
		}
	}
	return -1;
}

/**
 * Split template inner content on top-level "|" (ignoring separators nested in
 * templates or links).
 *
 * @param {string} content Text between `{{` and `}}`
 * @return {string[]} The name part followed by the parameter parts
 */
function splitTemplateParts( content ) {
	const parts = [];
	let depth = 0;
	let current = '';
	for ( let i = 0; i < content.length; i++ ) {
		const two = content.slice( i, i + 2 );
		if ( two === '{{' || two === '[[' ) {
			depth++;
			current += two;
			i++;
		} else if ( two === '}}' || two === ']]' ) {
			depth--;
			current += two;
			i++;
		} else if ( content[ i ] === '|' && depth === 0 ) {
			parts.push( current );
			current = '';
		} else {
			current += content[ i ];
		}
	}
	parts.push( current );
	return parts;
}

/**
 * Split a template parameter into [ name, value ] on its first top-level "=".
 *
 * @param {string} part
 * @return {string[]|null} [ name, value ], or null for a positional parameter
 */
function splitFirstEquals( part ) {
	let depth = 0;
	for ( let i = 0; i < part.length; i++ ) {
		const two = part.slice( i, i + 2 );
		if ( two === '{{' || two === '[[' ) {
			depth++;
			i++;
		} else if ( two === '}}' || two === ']]' ) {
			depth--;
			i++;
		} else if ( part[ i ] === '=' && depth === 0 ) {
			return [ part.slice( 0, i ), part.slice( i + 1 ) ];
		}
	}
	return null;
}

/**
 * Extract the infobox of an article: its name, the names of its parameters that
 * carry a non-empty value, and those values. The infobox is the first template
 * of the lead with at least MIN_INFOBOX_PARAMS such parameters, because the name
 * of an infobox template is different on each wiki.
 *
 * The values drive the lead-sentence slotting: they are the facts this article
 * states about its subject, so finding one in the opening sentence identifies
 * the field that belongs in that position.
 *
 * @param {string} wikitext
 * @return {{ name: string, params: string[], values: Object<string,string> }|null}
 */
function extractInfobox( wikitext ) {
	const firstHeading = wikitext.search( /^==/m );
	// A citation template in a reference can also have many parameters
	const lead = ( firstHeading === -1 ? wikitext : wikitext.slice( 0, firstHeading ) )
		.replace( /<!--[\s\S]*?-->/g, '' )
		.replace( /<ref\b[\s\S]*?<\/ref>/gi, '' );
	let start = lead.indexOf( '{{' );
	while ( start !== -1 ) {
		const end = findTemplateEnd( lead, start );
		if ( end === -1 ) {
			return null;
		}
		const parts = splitTemplateParts( lead.slice( start + 2, end - 2 ) );
		const params = [];
		const values = {};
		for ( let i = 1; i < parts.length; i++ ) {
			const pair = splitFirstEquals( parts[ i ] );
			if ( pair && pair[ 1 ].trim() !== '' ) {
				const param = pair[ 0 ].trim();
				params.push( param );
				values[ param ] = pair[ 1 ];
			}
		}
		if ( params.length >= MIN_INFOBOX_PARAMS ) {
			return { name: parts[ 0 ].trim(), params: params, values: values };
		}
		start = lead.indexOf( '{{', end );
	}
	return null;
}

/**
 * The most frequent surface form recorded in a { surface: count } tally.
 *
 * @param {Object} surfaces
 * @return {string}
 */
function mostFrequentSurface( surfaces ) {
	let best = '';
	let bestCount = -1;
	Object.keys( surfaces ).forEach( ( surface ) => {
		if ( surfaces[ surface ] > bestCount ) {
			best = surface;
			bestCount = surfaces[ surface ];
		}
	} );
	return best;
}

/**
 * Median of a list of numbers.
 *
 * @param {number[]} nums
 * @return {number}
 */
function median( nums ) {
	const sorted = nums.slice().sort( ( a, b ) => a - b );
	const mid = Math.floor( sorted.length / 2 );
	return sorted.length % 2 ? sorted[ mid ] : ( sorted[ mid - 1 ] + sorted[ mid ] ) / 2;
}

/**
 * Whether a section carries article content, as opposed to an appendix.
 *
 * Appendix sections are detected by their content, not their (localized) name:
 * the references section by a reflist marker, "See also" / "External links" by
 * their bare-link-list bodies. Both are excluded from the content structure.
 *
 * @param {{ heading: string, body: string }} section
 * @return {boolean}
 */
function isContentSection( section ) {
	return !isReferencesSection( section.body ) && !isLinkListSection( section.body );
}

/**
 * The normalized keys of an article's content sections, de-duplicated and in
 * document order — the article's structural signature for clustering.
 *
 * @param {Array<{heading: string, body: string}>} sections
 * @return {string[]}
 */
function contentHeadingKeys( sections ) {
	const keys = [];
	sections.forEach( ( section ) => {
		if ( !isContentSection( section ) ) {
			return;
		}
		const key = normalizeHeading( section.heading );
		if ( key !== '' && !keys.includes( key ) ) {
			keys.push( key );
		}
	} );
	return keys;
}

/**
 * Determine the common content sections across the articles, excluding appendix
 * sections (references / link lists), and detect the references heading.
 *
 * @param {Array<Array<{heading: string, body: string}>>} perArticleSections
 * @param {number} minCount Minimum articles a section must appear in
 * @return {{ body: Array<{heading: string}>, referencesHeading: (string|null) }}
 *   Common content-section headings and the detected references heading
 */
function aggregateSections( perArticleSections, minCount ) {
	const stats = {};
	const referencesSurfaces = {};
	perArticleSections.forEach( ( sections ) => {
		const seen = {};
		sections.forEach( ( section, index ) => {
			if ( isReferencesSection( section.body ) ) {
				referencesSurfaces[ section.heading ] =
					( referencesSurfaces[ section.heading ] || 0 ) + 1;
				return;
			}
			if ( isLinkListSection( section.body ) ) {
				return;
			}
			const key = normalizeHeading( section.heading );
			if ( key === '' || seen[ key ] ) {
				return;
			}
			seen[ key ] = true;
			if ( !stats[ key ] ) {
				stats[ key ] = {
					count: 0,
					indices: [],
					surfaces: {}
				};
			}
			const stat = stats[ key ];
			stat.count++;
			stat.indices.push( index );
			stat.surfaces[ section.heading ] = ( stat.surfaces[ section.heading ] || 0 ) + 1;
		} );
	} );

	const body = Object.keys( stats )
		.filter( ( key ) => stats[ key ].count >= minCount )
		.sort( ( a, b ) => {
			const diff = median( stats[ a ].indices ) - median( stats[ b ].indices );
			return diff !== 0 ? diff : stats[ b ].count - stats[ a ].count;
		} )
		.map( ( key ) => ( { heading: mostFrequentSurface( stats[ key ].surfaces ) } ) );

	const referencesHeading = Object.keys( referencesSurfaces ).length ?
		mostFrequentSurface( referencesSurfaces ) : null;

	return { body: body, referencesHeading: referencesHeading };
}

/**
 * Pick the dominant infobox and its commonly-filled parameters.
 *
 * @param {Array} perArticleInfoboxes Array of { name, params } (or null)
 * @return {{ name: string, params: string[] }|null}
 */
function aggregateInfobox( perArticleInfoboxes ) {
	const nameSurfaces = {};
	const nameCounts = {};
	perArticleInfoboxes.forEach( ( infobox ) => {
		if ( !infobox ) {
			return;
		}
		const key = infobox.name.toLowerCase().replace( /\s+/g, ' ' ).trim();
		nameCounts[ key ] = ( nameCounts[ key ] || 0 ) + 1;
		if ( !nameSurfaces[ key ] ) {
			nameSurfaces[ key ] = {};
		}
		nameSurfaces[ key ][ infobox.name ] = ( nameSurfaces[ key ][ infobox.name ] || 0 ) + 1;
	} );

	let dominant = null;
	let dominantCount = 0;
	Object.keys( nameCounts ).forEach( ( key ) => {
		if ( nameCounts[ key ] > dominantCount ) {
			dominant = key;
			dominantCount = nameCounts[ key ];
		}
	} );
	if ( dominant === null ) {
		return null;
	}

	const paramCounts = {};
	const paramOrder = [];
	perArticleInfoboxes.forEach( ( infobox ) => {
		if ( !infobox || infobox.name.toLowerCase().replace( /\s+/g, ' ' ).trim() !== dominant ) {
			return;
		}
		const seen = {};
		infobox.params.forEach( ( param ) => {
			if ( seen[ param ] ) {
				return;
			}
			seen[ param ] = true;
			if ( paramCounts[ param ] === undefined ) {
				paramCounts[ param ] = 0;
				paramOrder.push( param );
			}
			paramCounts[ param ]++;
		} );
	} );

	const minCount = Math.max( 1, Math.ceil( dominantCount * INFOBOX_FIELD_THRESHOLD ) );
	const params = paramOrder
		.filter( ( param ) => paramCounts[ param ] >= minCount )
		.sort( ( a, b ) => {
			const diff = paramCounts[ b ] - paramCounts[ a ];
			return diff !== 0 ? diff : paramOrder.indexOf( a ) - paramOrder.indexOf( b );
		} );

	return { name: mostFrequentSurface( nameSurfaces[ dominant ] ), params: params };
}

/**
 * Tally values across articles (de-duped per article) and return them ordered by
 * descending frequency.
 *
 * @param {Array[]} perArticleValues
 * @return {Array<{ value: string, count: number }>}
 */
function rankByFrequency( perArticleValues ) {
	const counts = {};
	const order = [];
	perArticleValues.forEach( ( values ) => {
		const seen = {};
		values.forEach( ( value ) => {
			if ( seen[ value ] ) {
				return;
			}
			seen[ value ] = true;
			if ( counts[ value ] === undefined ) {
				counts[ value ] = 0;
				order.push( value );
			}
			counts[ value ]++;
		} );
	} );
	return order
		.map( ( value ) => ( { value: value, count: counts[ value ] } ) )
		.sort( ( a, b ) => {
			const diff = b.count - a.count;
			return diff !== 0 ? diff : order.indexOf( a.value ) - order.indexOf( b.value );
		} );
}

/**
 * The article's opening sentence, as prose.
 *
 * The lead is everything before the first level-2 heading, with the infobox,
 * hatnotes, images and references removed. Sentence detection is approximate: it
 * cuts at the first sentence-ending punctuation that is not an initial ("J.") or
 * a short abbreviation ("St."), and gives up on a lead with no usable break.
 *
 * @param {string} wikitext
 * @return {string} Opening sentence, or '' when none could be isolated
 */
function extractLeadSentence( wikitext ) {
	const headingMatch = wikitext.match( /^={2,}[^=].*$/m );
	const lead = headingMatch ? wikitext.slice( 0, headingMatch.index ) : wikitext;
	// Bold markers survive stripToProse, since they mark the subject's own name.
	const text = stripToProse( lead ).replace( /\s+/g, ' ' ).trim();

	const re = /[.!?]\s/g;
	let match;
	while ( ( match = re.exec( text ) ) !== null ) {
		const end = match.index + 1;
		if ( end < MIN_SENTENCE_CHARS ) {
			continue;
		}
		const tail = text.slice( 0, match.index ).match( /(\S+)$/ );
		// A trailing short capitalized token is an initial or an abbreviation, so
		// the period does not end the sentence.
		if ( tail && /^[A-Z][A-Za-z]{0,2}$/.test( tail[ 1 ] ) ) {
			continue;
		}
		return text.slice( 0, end );
	}
	return text.length >= MIN_SENTENCE_CHARS && text.length <= MAX_SENTENCE_CHARS ? text : '';
}

/**
 * Reduce an infobox value to the plain text it renders as, so it can be matched
 * against the prose of the lead sentence.
 *
 * @param {string} value Raw parameter value
 * @return {string}
 */
function cleanInfoboxValue( value ) {
	const text = stripTemplates( value
		.replace( /<!--[\s\S]*?-->/g, '' )
		.replace( /<ref\b[\s\S]*?<\/ref>/gi, '' )
		.replace( /<ref\b[^>]*\/>/gi, '' ) );
	return flattenLinks( text )
		.replace( /<[^>]+>/g, '' )
		.replace( /'{2,}/g, '' )
		.replace( /\s+/g, ' ' )
		.trim();
}

/**
 * Find the first occurrence of `needle` in `haystack` (case-insensitively) that
 * does not overlap an already-claimed range.
 *
 * @param {string} haystack
 * @param {string} needle
 * @param {Array<number[]>} claimed Ranges as [ start, end )
 * @return {number} Start index, or -1 when there is no free occurrence
 */
function findUnclaimed( haystack, needle, claimed ) {
	const lower = haystack.toLowerCase();
	const target = needle.toLowerCase();
	let from = 0;
	for ( ;; ) {
		const start = lower.indexOf( target, from );
		if ( start === -1 ) {
			return -1;
		}
		const end = start + target.length;
		const clash = claimed.some( ( range ) => start < range[ 1 ] && end > range[ 0 ] );
		if ( !clash ) {
			return start;
		}
		from = start + 1;
	}
}

/**
 * Turn one article's opening sentence into a reusable pattern, by replacing the
 * facts it states with the name of the infobox field that holds each.
 *
 * The subject's own name is the bolded text of the lead sentence. Longer values
 * are matched first, so "Paris, France" wins over "France", and each match
 * claims its span so two fields cannot slot the same words.
 *
 * @param {string} sentence Opening sentence, with bold markers intact
 * @param {Object<string,string>} values Infobox parameter → raw value
 * @return {{ text: string, slots: string[] }} The pattern, and its slot names in
 *   the order they appear
 */
function templatizeSentence( sentence, values ) {
	const nameMatch = sentence.match( /'''(.+?)'''/ );
	const base = sentence.replace( /'{2,}/g, '' ).replace( /\s+/g, ' ' ).trim();

	const candidates = [];
	if ( nameMatch ) {
		// No length floor on the name: it is unambiguous, however short.
		candidates.push( { slot: 'name', value: cleanInfoboxValue( nameMatch[ 1 ] ) } );
	}
	const fieldCandidates = Object.keys( values )
		.filter( ( param ) => !NON_PROSE_FIELD_RE.test( param ) )
		.map( ( param ) => ( { slot: param, value: cleanInfoboxValue( values[ param ] ) } ) )
		.filter( ( candidate ) => candidate.value.length >= MIN_SLOT_VALUE_CHARS )
		.sort( ( a, b ) => b.value.length - a.value.length );

	const claimed = [];
	const found = [];
	candidates.concat( fieldCandidates ).forEach( ( candidate ) => {
		if ( candidate.value === '' ) {
			return;
		}
		const start = findUnclaimed( base, candidate.value, claimed );
		if ( start === -1 ) {
			return;
		}
		const end = start + candidate.value.length;
		claimed.push( [ start, end ] );
		found.push( { slot: candidate.slot, start: start, end: end } );
	} );

	// Apply from the end, so earlier positions stay valid.
	let text = base;
	found.slice().sort( ( a, b ) => b.start - a.start ).forEach( ( item ) => {
		text = text.slice( 0, item.start ) + '[' + item.slot + ']' + text.slice( item.end );
	} );
	const slots = found.slice()
		.sort( ( a, b ) => a.start - b.start )
		.map( ( item ) => item.slot );
	return { text: text, slots: slots };
}

/**
 * Pick the lead pattern the examples agree on.
 *
 * Patterns are grouped by their slot sequence rather than by their exact
 * wording: articles of one type phrase the opening sentence differently but put
 * the same facts in the same order, so the sequence is what actually repeats.
 * The wording then comes from the shortest member of the winning group — the
 * least embellished way the examples say it.
 *
 * @param {Array<{text: string, slots: string[], title: string}>} leads Patterns
 *   of the articles that have a readable opening sentence
 * @param {number} total How many articles were read — the denominator of the
 *   share, so an article with no readable sentence counts against the pattern
 * @return {{ text: string, source: string, support: number, total: number }|null}
 *   null when no pattern is shared widely enough to offer
 */
function aggregateLeadPattern( leads, total ) {
	const groups = {};
	leads.forEach( ( lead ) => {
		if ( lead.slots.length < MIN_LEAD_SLOTS ) {
			return;
		}
		const key = lead.slots.join( '|' );
		if ( !groups[ key ] ) {
			groups[ key ] = [];
		}
		groups[ key ].push( lead );
	} );

	const bestKey = Object.keys( groups ).sort( ( a, b ) => {
		const diff = groups[ b ].length - groups[ a ].length;
		// A tie goes to the pattern that slots more facts.
		return diff !== 0 ? diff : b.split( '|' ).length - a.split( '|' ).length;
	} )[ 0 ];
	const minSupport = Math.max(
		MIN_LEAD_SUPPORT,
		Math.ceil( total * MIN_LEAD_SUPPORT_SHARE )
	);
	if ( bestKey === undefined || groups[ bestKey ].length < minSupport ) {
		return null;
	}

	const group = groups[ bestKey ];
	const representative = group.slice()
		.sort( ( a, b ) => a.text.length - b.text.length )[ 0 ];
	return {
		text: representative.text,
		source: representative.title,
		support: group.length,
		total: total
	};
}

/**
 * Assemble the outline-page wikitext from the aggregated dimensions.
 *
 * @param {Object} data
 * @param {string} data.qId Article type Q ID, or space-separated Q IDs (the first is the primary)
 * @param {string} data.label Human label for the type
 * @param {Object} data.sections { body: Array<{heading}>, referencesHeading }
 * @param {Object|null} data.infobox { name, params }
 * @param {Array<{value,count}>} data.categories Ranked categories
 * @param {Array<{value,count}>} data.domains Ranked external source domains
 * @param {Object|null} data.lead { text } lead pattern
 * @return {string} Outline-page wikitext
 */
function buildOutline( data ) {
	const lines = [];

	const topCategory = data.categories.length ? data.categories[ 0 ].value : '';
	let tagOpen = '<article-guidance article-type="' + data.qId + '"';
	if ( topCategory !== '' ) {
		// A category name can contain a double quote
		tagOpen += ' category="' + topCategory.replace( /"/g, '&quot;' ) + '"';
	}
	tagOpen += '>';
	lines.push( tagOpen );
	lines.push( '' );
	lines.push( '<instructions>' );
	lines.push( '</instructions>' );
	lines.push( '' );
	lines.push( '<recommended-sources>' );
	data.domains.slice( 0, MAX_SOURCE_DOMAINS ).forEach( ( domain ) => {
		lines.push( '  <source>' + domain.value + '</source>' );
	} );
	lines.push( '</recommended-sources>' );
	lines.push( '' );
	lines.push( '</article-guidance>' );
	lines.push( '' );

	if ( data.infobox ) {
		lines.push( '{{' + data.infobox.name );
		data.infobox.params.forEach( ( param ) => {
			lines.push( '| ' + param + ' = ' );
		} );
		lines.push( '}}' );
		lines.push( '' );
	}

	if ( data.lead ) {
		lines.push( data.lead.text.replace( '[name]', "'''[name]'''" ) );
	} else if ( data.label ) {
		lines.push( "'''" + data.label + "'''" );
	}
	lines.push( '' );

	data.sections.body.forEach( ( section ) => {
		lines.push( '== ' + section.heading + ' ==' );
		lines.push( '' );
	} );

	// English heading for when no example has a references section to copy
	lines.push( '== ' + ( data.sections.referencesHeading || 'References' ) + ' ==' );
	lines.push( '<references>' );
	// The new article flow puts the references of the user here, with preloadparams
	lines.push( '$1' );
	lines.push( '</references>' );

	return lines.join( '\n' );
}

/**
 * Generate an outline from a set of selected example articles.
 *
 * @param {string} qId Article type Q ID, or space-separated Q IDs (the first is the primary)
 * @param {string} label Human label for the type
 * @param {Array} articles Selected article rows (each with a `title`)
 * @return {Promise<string>} Outline-page wikitext
 */
async function generateOutline( qId, label, articles ) {
	const titles = articles.map( ( article ) => article.title );
	const wikitextByTitle = await fetchWikitext( titles );
	const categoryNames = await getCategoryNames();

	const perArticleSections = [];
	const perArticleInfoboxes = [];
	const perArticleCategories = [];
	const perArticleDomains = [];
	const perArticleLeads = [];
	titles.forEach( ( title ) => {
		const wikitext = wikitextByTitle[ title ];
		if ( !wikitext ) {
			return;
		}
		const infobox = extractInfobox( wikitext );
		perArticleSections.push( extractSectionData( wikitext ) );
		perArticleInfoboxes.push( infobox );
		perArticleCategories.push( extractCategories( wikitext, categoryNames ) );
		perArticleDomains.push( extractReferenceDomains( wikitext ) );
		const sentence = extractLeadSentence( wikitext );
		if ( sentence !== '' ) {
			const lead = templatizeSentence( sentence, infobox ? infobox.values : {} );
			perArticleLeads.push( {
				text: lead.text,
				slots: lead.slots,
				title: title
			} );
		}
	} );
	const count = perArticleSections.length;

	// When the cohort splits into distinct kinds of page, the skeleton comes from
	// the largest kind alone: a threshold over all of them would union structures
	// that no single article has.
	const clusters = clusterByStructure( perArticleSections.map( contentHeadingKeys ) );
	const split = dominantArchetype( clusters, count );
	const members = split ?
		split.members :
		perArticleSections.map( ( article, index ) => index );
	const sectionSource = members.map( ( index ) => perArticleSections[ index ] );

	const minCount = Math.max( 1, Math.ceil( sectionSource.length * SECTION_THRESHOLD ) );
	const sections = aggregateSections( sectionSource, minCount );

	return buildOutline( {
		qId: qId,
		label: label,
		sections: sections,
		infobox: aggregateInfobox( perArticleInfoboxes ),
		categories: rankByFrequency( perArticleCategories ),
		// Ranked by how many articles cite the domain. buildOutline lists the top
		// ones, and the maintainer curates them.
		domains: rankByFrequency( perArticleDomains ).filter(
			( domain ) => domain.count >= Math.min( MIN_SOURCE_ARTICLES, count )
		),
		lead: aggregateLeadPattern( perArticleLeads, count )
	} );
}

module.exports = {
	generateOutline,
	// Exported for unit testing: the pure steps that turn wikitext into the
	// pieces of the outline.
	extractLeadSentence,
	templatizeSentence,
	aggregateLeadPattern,
	contentHeadingKeys,
	extractReferenceDomains
};
