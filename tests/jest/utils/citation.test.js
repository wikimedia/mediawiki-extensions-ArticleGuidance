'use strict';

const { citationToWikitext } = require( '../../../resources/ext.articleguidance.newarticle/utils/citation.js' );

// A representative per-wiki maps.citoid (English template here, but the point is
// the parameter names come from the map, not a hardcoded table).
const WEB_MAP = {
	url: 'url',
	title: 'title',
	accessDate: 'access-date',
	publicationTitle: 'website',
	date: 'date',
	ISBN: [ 'isbn' ],
	author: [
		[ 'first', 'last' ],
		[ 'first2', 'last2' ],
		[ 'first3', 'last3' ]
	]
};

beforeEach( () => {
	global.mw = Object.assign( {}, global.mw, {
		log: { warn: jest.fn() }
	} );
} );

describe( 'citationToWikitext with maps.citoid', () => {
	it( 'maps scalar fields through the citoid map', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com/article',
			title: 'Example Article',
			publicationTitle: 'Example Site',
			accessDate: '2026-05-12'
		};
		expect( citationToWikitext( citation, 'Cite web', WEB_MAP ) ).toBe(
			'{{Cite web|url=https://example.com/article|title=Example Article|access-date=2026-05-12|website=Example Site}}'
		);
	} );

	it( 'localises parameter names per the map (frwiki style)', () => {
		const frMap = { url: 'url', title: 'titre', accessDate: 'consulté le' };
		const citation = {
			itemType: 'webpage',
			url: 'https://example.fr',
			title: 'Bonjour',
			accessDate: '2026-05-12'
		};
		expect( citationToWikitext( citation, 'Lien web', frMap ) ).toBe(
			'{{Lien web|url=https://example.fr|titre=Bonjour|consulté le=2026-05-12}}'
		);
	} );

	it( 'handles a 1-D array field (isbn → [isbn])', () => {
		const citation = {
			itemType: 'book',
			title: 'A Book',
			ISBN: [ '978-3-16-148410-0', 'should not appear' ]
		};
		expect( citationToWikitext( citation, 'Cite book', WEB_MAP ) ).toBe(
			'{{Cite book|title=A Book|isbn=978-3-16-148410-0}}'
		);
	} );

	it( 'maps a single author from the 2-D string array', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com',
			author: [ [ 'Jane', 'Doe' ] ]
		};
		expect( citationToWikitext( citation, 'Cite web', WEB_MAP ) ).toBe(
			'{{Cite web|url=https://example.com|first=Jane|last=Doe}}'
		);
	} );

	it( 'maps multiple authors using indexed param names', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com',
			author: [ [ 'Jane', 'Doe' ], [ 'John', 'Smith' ] ]
		};
		expect( citationToWikitext( citation, 'Cite web', WEB_MAP ) ).toBe(
			'{{Cite web|url=https://example.com|first=Jane|last=Doe|first2=John|last2=Smith}}'
		);
	} );

	it( 'omits an author name part that is empty', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com',
			author: [ [ '', 'Doe' ] ]
		};
		expect( citationToWikitext( citation, 'Cite web', WEB_MAP ) ).toBe(
			'{{Cite web|url=https://example.com|last=Doe}}'
		);
	} );

	it( 'concatenates authors when the map is a flat string (unbalanced)', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com',
			author: [ [ 'Jane', 'Doe' ], [ 'John', 'Smith' ] ]
		};
		const map = { url: 'url', author: 'author' };
		expect( citationToWikitext( citation, 'Cite web', map ) ).toBe(
			'{{Cite web|url=https://example.com|author=Jane Doe, John Smith}}'
		);
	} );

	it( 'joins each author into a string param when the map is a 1-D array', () => {
		const citation = {
			itemType: 'webpage',
			url: 'https://example.com',
			author: [ [ 'Jane', 'Doe' ], [ 'John', 'Smith' ] ]
		};
		const map = { url: 'url', author: [ 'author1', 'author2' ] };
		expect( citationToWikitext( citation, 'Cite web', map ) ).toBe(
			'{{Cite web|url=https://example.com|author1=Jane Doe|author2=John Smith}}'
		);
	} );

	it( 'concatenates a 1-D array into a single string param', () => {
		const citation = { itemType: 'webpage', url: 'https://example.com', isbn: [ 'a', 'b' ] };
		const map = { url: 'url', isbn: 'isbn' };
		expect( citationToWikitext( citation, 'Cite web', map ) ).toBe(
			'{{Cite web|url=https://example.com|isbn=a, b}}'
		);
	} );

	it( 'sets a template param only once when several citoid fields map to it (first wins)', () => {
		// fr maps both publicationTitle and libraryCatalog to 'périodique'.
		const map = { publicationTitle: 'périodique', libraryCatalog: 'périodique', url: 'url' };
		const citation = {
			itemType: 'journalArticle',
			url: 'https://example.com',
			publicationTitle: 'PLOS ONE',
			libraryCatalog: 'PLoS Journals'
		};
		expect( citationToWikitext( citation, 'Article', map ) ).toBe(
			'{{Article|périodique=PLOS ONE|url=https://example.com}}'
		);
	} );

	it( 'returns null when the map yields no params', () => {
		const citation = { itemType: 'webpage', somethingUnmapped: 'x' };
		expect( citationToWikitext( citation, 'Cite web', { url: 'url' } ) ).toBeNull();
	} );

	it( 'does not warn when a map is provided', () => {
		const citation = { itemType: 'webpage', url: 'https://example.com' };
		citationToWikitext( citation, 'Cite web', WEB_MAP );
		expect( global.mw.log.warn ).not.toHaveBeenCalled();
	} );
} );

describe( 'citationToWikitext null handling', () => {
	it( 'returns null when citationData is null', () => {
		expect( citationToWikitext( null, 'Cite web', WEB_MAP ) ).toBeNull();
	} );

	it( 'returns null when citationData has no itemType', () => {
		expect( citationToWikitext( { url: 'https://example.com' }, 'Cite web', WEB_MAP ) ).toBeNull();
	} );

	it( 'returns null when templateName is missing', () => {
		const citation = { itemType: 'webpage', url: 'https://example.com' };
		expect( citationToWikitext( citation, null, WEB_MAP ) ).toBeNull();
	} );
} );

describe( 'citationToWikitext without maps.citoid', () => {
	it( 'returns null and warns, like the VisualEditor citation dialog', () => {
		const citation = { itemType: 'webpage', url: 'https://example.com', title: 'Example' };
		expect( citationToWikitext( citation, 'Cite web', null ) ).toBeNull();
		expect( global.mw.log.warn ).toHaveBeenCalled();
	} );
} );
