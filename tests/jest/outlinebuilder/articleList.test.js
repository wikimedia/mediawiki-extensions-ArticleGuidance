'use strict';

const {
	mergeArticles
} = require( '../../../resources/ext.articleguidance.outlinebuilder/articleList.js' );

const TYPE = { key: 'type', name: '' };
const CATEGORY = { key: 'category', name: 'Beaches' };
const MANUAL = { key: 'manual', name: '' };

/**
 * Build a result row of the shape the finder produces.
 *
 * @param {string} item
 * @param {string} title
 * @return {Object}
 */
function row( item, title ) {
	return { item: item, title: title, sizeBytes: 1000, sections: 4 };
}

describe( 'mergeArticles', () => {
	it( 'adds rows to an empty list and stamps their source', () => {
		const result = mergeArticles( [], [ row( 'Q1', 'Copacabana' ) ], TYPE );

		expect( result.articles ).toHaveLength( 1 );
		expect( result.articles[ 0 ].source ).toEqual( TYPE );
		expect( result.addedItems ).toEqual( [ 'Q1' ] );
	} );

	it( 'keeps the rest of the row untouched', () => {
		const result = mergeArticles( [], [ row( 'Q1', 'Copacabana' ) ], TYPE );

		expect( result.articles[ 0 ].item ).toBe( 'Q1' );
		expect( result.articles[ 0 ].title ).toBe( 'Copacabana' );
		expect( result.articles[ 0 ].sizeBytes ).toBe( 1000 );
		expect( result.articles[ 0 ].sections ).toBe( 4 );
	} );

	it( 'does not mutate the list it is given', () => {
		const existing = [ row( 'Q1', 'Copacabana' ) ];

		mergeArticles( existing, [ row( 'Q2', 'Bondi Beach' ) ], CATEGORY );

		expect( existing ).toHaveLength( 1 );
		expect( existing[ 0 ].source ).toBeUndefined();
	} );

	it( 'skips a title already in the list, whatever its item is', () => {
		// The same article carries a Q ID from the type search and a title-derived
		// placeholder when it has no Wikidata item.
		const existing = mergeArticles( [], [ row( 'Q1', 'Copacabana' ) ], TYPE ).articles;

		const result = mergeArticles(
			existing, [ row( 'title:Copacabana', 'Copacabana' ) ], CATEGORY
		);

		expect( result.articles ).toHaveLength( 1 );
		expect( result.addedItems ).toEqual( [] );
		expect( result.articles[ 0 ].source ).toEqual( TYPE );
	} );

	it( 'skips an item already in the list under another title', () => {
		const existing = mergeArticles( [], [ row( 'Q1', 'Copacabana' ) ], TYPE ).articles;

		const result = mergeArticles( existing, [ row( 'Q1', 'Copacabana Beach' ) ], MANUAL );

		expect( result.articles ).toHaveLength( 1 );
		expect( result.addedItems ).toEqual( [] );
	} );

	it( 'keeps existing rows in place and appends the new ones', () => {
		const existing = mergeArticles(
			[], [ row( 'Q1', 'Copacabana' ), row( 'Q2', 'Bondi Beach' ) ], TYPE
		).articles;

		const result = mergeArticles(
			existing, [ row( 'Q2', 'Bondi Beach' ), row( 'Q3', 'Waikiki' ) ], CATEGORY
		);

		expect( result.articles.map( ( article ) => article.title ) )
			.toEqual( [ 'Copacabana', 'Bondi Beach', 'Waikiki' ] );
		expect( result.addedItems ).toEqual( [ 'Q3' ] );
		expect( result.articles[ 1 ].source ).toEqual( TYPE );
		expect( result.articles[ 2 ].source ).toEqual( CATEGORY );
	} );

	it( 'de-duplicates within a single batch', () => {
		const result = mergeArticles(
			[], [ row( 'Q1', 'Copacabana' ), row( 'Q1', 'Copacabana' ) ], TYPE
		);

		expect( result.articles ).toHaveLength( 1 );
		expect( result.addedItems ).toEqual( [ 'Q1' ] );
	} );

	it( 'leaves the list alone when nothing comes in', () => {
		const existing = mergeArticles( [], [ row( 'Q1', 'Copacabana' ) ], TYPE ).articles;

		const result = mergeArticles( existing, [], CATEGORY );

		expect( result.articles ).toEqual( existing );
		expect( result.addedItems ).toEqual( [] );
	} );
} );
