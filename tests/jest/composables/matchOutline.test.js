'use strict';

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Wikidata.js',
	() => ( { fetchEntityClaims: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Sparql.js',
	() => ( { checkItemHierarchyMatches: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/logging/search.js',
	() => ( { reportOutlineMatch: jest.fn() } )
);

const { fetchEntityClaims } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Wikidata.js'
);
const { checkItemHierarchyMatches } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Sparql.js'
);
const { matchOutline } = require(
	'../../../resources/ext.articleguidance.newarticle/composables/matchOutline.js'
);

const genericOutline = { title: 'Generic', generic: true, articleTypes: [] };
const cityOutline = {
	title: 'City',
	articleTypes: [ { id: 'Q515', matchVia: null, hierarchyDepth: 5 } ]
};
const settlementOutline = {
	title: 'Settlement',
	articleTypes: [ { id: 'Q486972', matchVia: null, hierarchyDepth: 3 } ]
};
const tennisOutline = {
	title: 'Tennis player',
	articleTypes: [ { id: 'Q10833314', matchVia: 'P106', hierarchyDepth: 2 } ]
};

describe( 'matchOutline', () => {
	beforeEach( () => {
		fetchEntityClaims.mockReset();
		checkItemHierarchyMatches.mockReset();
		fetchEntityClaims.mockResolvedValue( {} );
		checkItemHierarchyMatches.mockResolvedValue( {} );
	} );

	it( 'skips matching when no outline declares an article type', async () => {
		expect( await matchOutline( 'Q1492', [ genericOutline ], 'en' ) ).toBe( null );
		expect( fetchEntityClaims ).not.toHaveBeenCalled();
		expect( checkItemHierarchyMatches ).not.toHaveBeenCalled();
	} );

	it( 'queries the hierarchy for the selected item only', async () => {
		await matchOutline( 'Q1492', [ genericOutline, cityOutline, tennisOutline ], 'en' );

		expect( checkItemHierarchyMatches ).toHaveBeenCalledWith(
			[ 'Q1492' ],
			{ default: [ 'Q515' ], P106: [ 'Q10833314' ] }
		);
		expect( fetchEntityClaims ).toHaveBeenCalledWith( [ 'Q1492' ], 'en' );
	} );

	it( 'matches a direct P31 value', async () => {
		fetchEntityClaims.mockResolvedValue( {
			Q1492: { claims: { P31: [ 'Q515' ] } }
		} );

		expect( await matchOutline( 'Q1492', [ cityOutline ], 'en' ) ).toBe( 'Q515' );
	} );

	it( 'matches an item that is itself an outline type', async () => {
		expect( await matchOutline( 'Q515', [ cityOutline ], 'en' ) ).toBe( 'Q515' );
	} );

	it( 'picks the deepest hierarchy match', async () => {
		checkItemHierarchyMatches.mockResolvedValue( {
			default: { Q1492: new Set( [ 'Q486972', 'Q515' ] ) }
		} );

		expect(
			await matchOutline( 'Q1492', [ settlementOutline, cityOutline ], 'en' )
		).toBe( 'Q515' );
	} );

	it( 'returns null when nothing matches', async () => {
		fetchEntityClaims.mockResolvedValue( {
			Q42: { claims: { P31: [ 'Q5' ] } }
		} );

		expect( await matchOutline( 'Q42', [ cityOutline ], 'en' ) ).toBe( null );
	} );
} );
