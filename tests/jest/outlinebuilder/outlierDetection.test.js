'use strict';

const {
	findOutliers
} = require( '../../../resources/ext.articleguidance.outlinebuilder/outlierDetection.js' );

/**
 * Build a candidate row of the shape findExampleArticles returns.
 *
 * @param {string} item
 * @param {number|null} sizeBytes
 * @param {number|null} sections
 * @param {string} quality
 * @return {Object}
 */
function row( item, sizeBytes, sections, quality = '' ) {
	return { item: item, title: item, sizeBytes: sizeBytes, sections: sections, quality: quality };
}

/**
 * A cohort of well-developed articles, tight enough that an atypical row stands
 * out at either tail. Median 12 sections.
 *
 * @param {number} count
 * @return {Object[]}
 */
function developedCohort( count ) {
	const rows = [];
	for ( let i = 0; i < count; i++ ) {
		rows.push( row( 'Q' + i, 90000 + i * 1000, 11 + ( i % 3 ) ) );
	}
	return rows;
}

describe( 'findOutliers', () => {
	it( 'cuts the low tail of a developed cohort', () => {
		const articles = developedCohort( 8 ).concat( [
			row( 'thin', 14000, 3 ),
			row( 'thinner', 9000, 2 )
		] );

		expect( findOutliers( articles ) ).toEqual( {
			thin: 'sections-low',
			thinner: 'sections-low'
		} );
	} );

	it( 'cuts the high tail on section count', () => {
		// Far more sections than the cohort: a different kind of page, and because
		// the recommended sources are a union it would dominate them.
		const articles = developedCohort( 8 ).concat( [
			row( 'sprawling', 446654, 32 )
		] );

		expect( findOutliers( articles ) ).toEqual( { sprawling: 'sections-high' } );
	} );

	it( 'cuts both tails at once', () => {
		const articles = developedCohort( 8 ).concat( [
			row( 'sprawling', 446654, 32 ),
			row( 'thin', 9000, 2 )
		] );

		expect( findOutliers( articles ) ).toEqual( {
			sprawling: 'sections-high',
			thin: 'sections-low'
		} );
	} );

	it( 'does not cut the high tail on byte length alone', () => {
		// Long but structured like the cohort: a thorough exemplar, not an outlier.
		const articles = developedCohort( 8 ).concat( [
			row( 'thorough', 400000, 13 )
		] );

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'reports size when only the byte length is out of line', () => {
		const articles = developedCohort( 8 ).concat( [
			// Section count sits in the cohort, so only the size cut-off trips.
			row( 'padded', 4000, 11 )
		] );

		expect( findOutliers( articles ) ).toEqual( { padded: 'size' } );
	} );

	it( 'is relative to the cohort, not to absolute floors', () => {
		// Every row here would clear isStub()'s 3000-byte / 2-section floors.
		const articles = developedCohort( 8 ).concat( [ row( 'thin', 20000, 4 ) ] );

		expect( findOutliers( articles ) ).toEqual( { thin: 'sections-low' } );

		// The same row in a cohort of short articles is unremarkable.
		const shortCohort = [];
		for ( let i = 0; i < 8; i++ ) {
			shortCohort.push( row( 'S' + i, 18000 + i * 500, 4 + ( i % 2 ) ) );
		}
		expect( findOutliers( shortCohort.concat( [ row( 'thin', 20000, 4 ) ] ) ) ).toEqual( {} );
	} );

	it( 'never cuts a badged article, at either tail', () => {
		const articles = developedCohort( 8 ).concat( [
			row( 'short-featured', 9000, 2, 'featured' ),
			row( 'sprawling-good', 446654, 32, 'good' )
		] );

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'leaves rows with unfetched details alone', () => {
		const articles = developedCohort( 8 ).concat( [
			row( 'unknown', null, null )
		] );

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'does not cut when the pool is too small to trust a median', () => {
		const articles = [
			row( 'a', 90000, 11 ),
			row( 'b', 92000, 12 ),
			row( 'c', 9000, 2 )
		];

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'does not cut when pruning would leave too few articles', () => {
		// Four developed rows and two thin ones: the thin pair is below the
		// cut-off, but removing it would leave four, so nothing is cut.
		const articles = [
			row( 'big1', 90000, 12 ),
			row( 'big2', 90000, 12 ),
			row( 'big3', 90000, 12 ),
			row( 'big4', 90000, 12 ),
			row( 't1', 9000, 2 ),
			row( 't2', 9500, 2 )
		];

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'does not cut the high tail when the cohort itself is thin', () => {
		// Five one-section rows drag the median to 1, below the high-cut floor. The
		// two developed articles are the only usable examples, so cutting them as
		// "too many sections" would be exactly wrong.
		const articles = [
			row( 'big1', 90000, 12 ),
			row( 'big2', 92000, 12 ),
			row( 't1', 900, 1 ),
			row( 't2', 950, 1 ),
			row( 't3', 800, 1 ),
			row( 't4', 850, 1 ),
			row( 't5', 900, 1 )
		];

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'tolerates a cohort with no sections at all', () => {
		const articles = [];
		for ( let i = 0; i < 6; i++ ) {
			articles.push( row( 'Q' + i, 5000 + i * 100, 0 ) );
		}

		expect( findOutliers( articles ) ).toEqual( {} );
	} );

	it( 'does not flag near-median rows when the cohort is uniform', () => {
		// Deviation is 0 here, so the relative-scale floor has to keep the
		// cut-offs away from the median itself.
		const articles = [
			row( 'a', 90000, 11 ),
			row( 'b', 90000, 11 ),
			row( 'c', 90000, 11 ),
			row( 'd', 90000, 11 ),
			row( 'e', 89000, 10 ),
			row( 'f', 88000, 10 )
		];

		expect( findOutliers( articles ) ).toEqual( {} );
	} );
} );
