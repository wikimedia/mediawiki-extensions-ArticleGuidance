'use strict';

const {
	groupOutlinesByMatchVia,
	collectDirectMatches,
	applyHierarchyMatches,
	selectBestMatches
} = require( '../../../resources/ext.articleguidance.newarticle/composables/outlineMatching.js' );

describe( 'groupOutlinesByMatchVia', () => {
	it( 'buckets outline type Q IDs by matchVia, falling back to default', () => {
		const outlines = [
			{ articleTypes: [ { id: 'Q1', matchVia: null } ] },
			{ articleTypes: [ { id: 'Q2', matchVia: 'P106' } ] },
			{ articleTypes: [ { id: 'Q3', matchVia: 'P106' } ] },
			{ articleTypes: [ { id: 'Q4', matchVia: 'P171' } ] }
		];

		expect( groupOutlinesByMatchVia( outlines ) ).toEqual( {
			default: [ 'Q1' ],
			P106: [ 'Q2', 'Q3' ],
			P171: [ 'Q4' ]
		} );
	} );

	it( 'buckets each Q ID of a multi-item outline by its own matchVia', () => {
		// One outline listing an occupation item (P106) and a class item
		// (default) — each must land in its own path bucket (T421260).
		const outlines = [
			{ articleTypes: [
				{ id: 'Q639669', matchVia: 'P106' },
				{ id: 'Q215380', matchVia: null }
			] },
			{ articleTypes: [ { id: 'Q4830453', matchVia: null } ] }
		];

		expect( groupOutlinesByMatchVia( outlines ) ).toEqual( {
			P106: [ 'Q639669' ],
			default: [ 'Q215380', 'Q4830453' ]
		} );
	} );

	it( 'does not duplicate a Q ID shared by two outlines in one bucket', () => {
		const outlines = [
			{ articleTypes: [ { id: 'Q5', matchVia: null } ] },
			{ articleTypes: [ { id: 'Q5', matchVia: null } ] }
		];

		expect( groupOutlinesByMatchVia( outlines ) ).toEqual( {
			default: [ 'Q5' ]
		} );
	} );
} );

describe( 'collectDirectMatches', () => {
	const outlineQIdSet = new Set( [ 'Q11774891', 'Q2066131', 'Q5' ] );

	it( 'records a 0-hop match through P106 (regression for T427610)', () => {
		// Ian Moore (Q133869438): P106 → ice hockey player (Q11774891)
		const directTypesByGroup = {
			default: { Q133869438: new Set( [ 'Q5' ] ) },
			P106: { Q133869438: new Set( [ 'Q11774891' ] ) }
		};
		const matches = {};

		collectDirectMatches(
			matches, [ 'Q133869438' ], directTypesByGroup, outlineQIdSet
		);

		expect( matches.Q133869438 ).toContain( 'Q11774891' );
		expect( matches.Q133869438 ).toContain( 'Q5' );
	} );

	it( 'still records 0-hop matches through P31 (default group)', () => {
		const directTypesByGroup = {
			default: { Q123: new Set( [ 'Q5' ] ) }
		};
		const matches = {};

		collectDirectMatches(
			matches, [ 'Q123' ], directTypesByGroup, outlineQIdSet
		);

		expect( matches.Q123 ).toEqual( [ 'Q5' ] );
	} );

	it( 'ignores direct types that are not outline article types', () => {
		const directTypesByGroup = {
			P106: { Q123: new Set( [ 'Q999999' ] ) }
		};
		const matches = {};

		collectDirectMatches(
			matches, [ 'Q123' ], directTypesByGroup, outlineQIdSet
		);

		expect( matches.Q123 ).toBeUndefined();
	} );

	it( 'deduplicates when the same outline is matched via multiple groups', () => {
		const directTypesByGroup = {
			default: { Q123: new Set( [ 'Q11774891' ] ) },
			P106: { Q123: new Set( [ 'Q11774891' ] ) }
		};
		const matches = {};

		collectDirectMatches(
			matches, [ 'Q123' ], directTypesByGroup, outlineQIdSet
		);

		expect( matches.Q123 ).toEqual( [ 'Q11774891' ] );
	} );
} );

describe( 'applyHierarchyMatches', () => {
	it( 'merges hierarchy matches and ignores the excluded bucket', () => {
		const matches = { Q123: [ 'Q1' ] };
		const itemHierarchyMatches = {
			P106: { Q123: new Set( [ 'Q2', 'Q1' ] ) },
			__excluded__: { Q123: new Set( [ 'Q999' ] ) }
		};

		applyHierarchyMatches( matches, itemHierarchyMatches );

		expect( matches.Q123.sort() ).toEqual( [ 'Q1', 'Q2' ] );
	} );
} );

describe( 'selectBestMatches', () => {
	it( 'prefers the deeper P106 match (T427610 ice-hockey-player scenario)', () => {
		// Ian Moore matches both Ice hockey player (P106, depth 25) and
		// Sportsperson (P106, depth 19). The deeper outline wins.
		const outlines = [
			{ articleTypes: [ { id: 'Q11774891', matchVia: 'P106', hierarchyDepth: 25 } ] },
			{ articleTypes: [ { id: 'Q2066131', matchVia: 'P106', hierarchyDepth: 19 } ] }
		];
		const matches = { Q133869438: [ 'Q2066131', 'Q11774891' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q133869438 ).toEqual( [ 'Q11774891' ] );
	} );

	it( 'prefers a non-default matchVia over the default group', () => {
		// Outlines: default Q5 (human, depth 50), P106 Q10833314 (tennis player, depth 10).
		// Even though Q5 is deeper, the P106 strategy wins step 1.
		const outlines = [
			{ articleTypes: [ { id: 'Q5', matchVia: null, hierarchyDepth: 50 } ] },
			{ articleTypes: [ { id: 'Q10833314', matchVia: 'P106', hierarchyDepth: 10 } ] }
		];
		const matches = { Q123: [ 'Q5', 'Q10833314' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q123 ).toEqual( [ 'Q10833314' ] );
	} );

	it( 'falls back to depth ranking within the default group', () => {
		const outlines = [
			{ articleTypes: [ { id: 'Q1', matchVia: null, hierarchyDepth: 3 } ] },
			{ articleTypes: [ { id: 'Q2', matchVia: null, hierarchyDepth: 7 } ] },
			{ articleTypes: [ { id: 'Q3', matchVia: null, hierarchyDepth: 5 } ] }
		];
		const matches = { Q42: [ 'Q1', 'Q2', 'Q3' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q42 ).toEqual( [ 'Q2' ] );
	} );

	it( 'uses per-Q-ID depth when a multi-item outline competes with another outline', () => {
		// Company outline lists Q4830453 (business, depth 5) and Q783794
		// (company, depth 7); Bank outline has Q22687 (depth 6). An item
		// matched via the secondary company Q ID must be compared using that
		// ID's own depth, so the company match wins (T421260).
		const outlines = [
			{ articleTypes: [
				{ id: 'Q4830453', matchVia: null, hierarchyDepth: 5 },
				{ id: 'Q783794', matchVia: null, hierarchyDepth: 7 }
			] },
			{ articleTypes: [ { id: 'Q22687', matchVia: null, hierarchyDepth: 6 } ] }
		];
		const matches = { Q115146: [ 'Q4830453', 'Q783794', 'Q22687' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q115146 ).toEqual( [ 'Q783794' ] );
	} );

	it( 'keeps only the deeper Q ID when an item matches one outline twice', () => {
		const outlines = [
			{ articleTypes: [
				{ id: 'Q4830453', matchVia: null, hierarchyDepth: 5 },
				{ id: 'Q783794', matchVia: null, hierarchyDepth: 7 }
			] }
		];
		const matches = { Q115146: [ 'Q4830453', 'Q783794' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q115146 ).toEqual( [ 'Q783794' ] );
	} );

	it( 'selects a match found only via a secondary Q ID', () => {
		const outlines = [
			{ articleTypes: [
				{ id: 'Q4830453', matchVia: null, hierarchyDepth: 5 },
				{ id: 'Q783794', matchVia: null, hierarchyDepth: 7 }
			] }
		];
		const matches = { Q115146: [ 'Q783794' ] };

		const result = selectBestMatches( matches, outlines );

		expect( result.Q115146 ).toEqual( [ 'Q783794' ] );
	} );
} );
