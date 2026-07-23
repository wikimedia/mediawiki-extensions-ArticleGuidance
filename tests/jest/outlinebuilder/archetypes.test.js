'use strict';

const {
	clusterByStructure,
	dominantArchetype
} = require( '../../../resources/ext.articleguidance.outlinebuilder/archetypes.js' );

// Two clearly different kinds of page: museums described by their collection,
// and historic houses described by their architecture and owners.
const COLLECTION_SHAPE = [ 'history', 'collection', 'building' ];
const HOUSE_SHAPE = [ 'history', 'architecture', 'owners', 'gardens' ];

/**
 * Repeat a signature, varying one heading per copy so the members are similar
 * without being identical.
 *
 * @param {string[]} shape
 * @param {number} count
 * @return {Array<string[]>}
 */
function cohort( shape, count ) {
	const signatures = [];
	for ( let i = 0; i < count; i++ ) {
		signatures.push( shape.concat( [ 'extra' + ( i % 2 ) ] ) );
	}
	return signatures;
}

describe( 'clusterByStructure', () => {
	it( 'puts every article in exactly one group', () => {
		const signatures = cohort( COLLECTION_SHAPE, 4 ).concat( cohort( HOUSE_SHAPE, 3 ) );
		const clusters = clusterByStructure( signatures );
		const indices = [];
		clusters.forEach( ( cluster ) => {
			cluster.forEach( ( index ) => indices.push( index ) );
		} );
		expect( indices.sort( ( a, b ) => a - b ) ).toEqual( [ 0, 1, 2, 3, 4, 5, 6 ] );
	} );

	it( 'separates two distinct structures and returns the largest first', () => {
		const signatures = cohort( COLLECTION_SHAPE, 6 ).concat( cohort( HOUSE_SHAPE, 3 ) );
		const clusters = clusterByStructure( signatures );
		expect( clusters.length ).toBe( 2 );
		expect( clusters[ 0 ] ).toEqual( [ 0, 1, 2, 3, 4, 5 ] );
		expect( clusters[ 1 ] ).toEqual( [ 6, 7, 8 ] );
	} );

	it( 'keeps a uniform cohort in one group', () => {
		const clusters = clusterByStructure( cohort( COLLECTION_SHAPE, 8 ) );
		expect( clusters.length ).toBe( 1 );
		expect( clusters[ 0 ].length ).toBe( 8 );
	} );

	it( 'does not merge articles that share no headings', () => {
		const clusters = clusterByStructure( [ [ 'a' ], [ 'b' ], [ 'c' ] ] );
		expect( clusters.length ).toBe( 3 );
	} );

	it( 'treats articles with no headings as unrelated to each other', () => {
		const clusters = clusterByStructure( [ [], [], [] ] );
		expect( clusters.length ).toBe( 3 );
	} );
} );

describe( 'dominantArchetype', () => {
	it( 'reports the largest structure and the alternatives', () => {
		const signatures = cohort( COLLECTION_SHAPE, 6 ).concat( cohort( HOUSE_SHAPE, 3 ) );
		const split = dominantArchetype( clusterByStructure( signatures ), signatures.length );
		expect( split ).not.toBeNull();
		expect( split.members ).toEqual( [ 0, 1, 2, 3, 4, 5 ] );
		expect( split.others ).toEqual( [ [ 6, 7, 8 ] ] );
	} );

	it( 'returns null when the cohort did not split', () => {
		const signatures = cohort( COLLECTION_SHAPE, 8 );
		expect( dominantArchetype( clusterByStructure( signatures ), signatures.length ) )
			.toBeNull();
	} );

	it( 'returns null when the alternatives are all one-offs', () => {
		const signatures = cohort( COLLECTION_SHAPE, 6 ).concat( [ [ 'unrelated' ] ] );
		expect( dominantArchetype( clusterByStructure( signatures ), signatures.length ) )
			.toBeNull();
	} );

	it( 'returns null when no structure holds a majority', () => {
		// Three shapes of three: the largest speaks for a third of the cohort.
		const signatures = cohort( COLLECTION_SHAPE, 3 )
			.concat( cohort( HOUSE_SHAPE, 3 ) )
			.concat( cohort( [ 'plot', 'cast', 'reception' ], 3 ) );
		expect( dominantArchetype( clusterByStructure( signatures ), signatures.length ) )
			.toBeNull();
	} );

	it( 'returns null when the largest structure is too small to trust', () => {
		const signatures = cohort( COLLECTION_SHAPE, 3 ).concat( cohort( HOUSE_SHAPE, 2 ) );
		expect( dominantArchetype( clusterByStructure( signatures ), signatures.length ) )
			.toBeNull();
	} );
} );
