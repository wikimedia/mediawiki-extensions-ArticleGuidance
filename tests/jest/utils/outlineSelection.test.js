'use strict';

const {
	GENERIC_ARTICLE_TYPE,
	findGenericOutline,
	selectOutlineForResult,
	getOutlineLookupQId,
	outlineEventContext
} = require( '../../../resources/ext.articleguidance.newarticle/utils/outlineSelection.js' );

const companyOutline = {
	title: 'Wikipedia:Article guidance/Company',
	label: 'Company',
	generic: false,
	articleTypes: [ { id: 'Q4830453', hierarchyDepth: 5, matchVia: null } ]
};

const genericOutline = {
	title: 'Wikipedia:Article guidance/General',
	label: 'General guidance',
	generic: true,
	articleTypes: []
};

// An outline is linked to a set of Q IDs and none of them is privileged
const musicianOutline = {
	title: 'Wikipedia:Article guidance/Musician',
	label: 'Musician',
	generic: false,
	articleTypes: [
		{ id: 'Q639669', hierarchyDepth: 4, matchVia: 'P106' },
		{ id: 'Q177220', hierarchyDepth: 5, matchVia: 'P106' }
	]
};

describe( 'findGenericOutline', () => {
	it( 'returns the generic outline', () => {
		expect( findGenericOutline( [ companyOutline, genericOutline ] ) )
			.toBe( genericOutline );
	} );

	it( 'returns null when no outline is generic', () => {
		expect( findGenericOutline( [ companyOutline ] ) ).toBeNull();
	} );

	it( 'returns null when the outlines are not loaded yet', () => {
		expect( findGenericOutline( null ) ).toBeNull();
	} );
} );

describe( 'selectOutlineForResult', () => {
	// The three cases of the outline fallback (T435605)
	it( 'uses the matching outline when there is one', () => {
		expect( selectOutlineForResult( [ companyOutline, genericOutline ], 'Q4830453' ) )
			.toBe( companyOutline );
	} );

	it( 'falls back to the generic outline when nothing matches', () => {
		expect( selectOutlineForResult( [ companyOutline, genericOutline ], null ) )
			.toBe( genericOutline );
	} );

	it( 'returns null when nothing matches and there is no generic outline', () => {
		expect( selectOutlineForResult( [ companyOutline ], null ) ).toBeNull();
	} );

	it( 'falls back to the generic outline when the matched Q ID has no outline', () => {
		// Defensive. Matching and selection read the same outline list, so a
		// matched Q ID normally has an outline. This keeps a result that loses
		// its outline from leaving the workflow without an outline.
		expect( selectOutlineForResult( [ companyOutline, genericOutline ], 'Q5' ) )
			.toBe( genericOutline );
	} );
} );

describe( 'getOutlineLookupQId', () => {
	it( 'names the generic outline with the sentinel', () => {
		expect( getOutlineLookupQId( genericOutline ) ).toBe( GENERIC_ARTICLE_TYPE );
		expect( getOutlineLookupQId( genericOutline ) ).toBe( '*' );
	} );

	it( 'returns a Q ID the server can resolve the outline from', () => {
		expect( getOutlineLookupQId( companyOutline ) ).toBe( 'Q4830453' );
		// Any of the set resolves the outline, so the first is good enough
		expect( musicianOutline.articleTypes.map( ( type ) => type.id ) )
			.toContain( getOutlineLookupQId( musicianOutline ) );
	} );

	it( 'returns null when there is no outline', () => {
		expect( getOutlineLookupQId( null ) ).toBeNull();
	} );
} );

/* eslint-disable camelcase -- matched_qid matches the other event fields */
describe( 'outlineEventContext', () => {
	it( 'reports every Q ID of the outline, and which one matched', () => {
		// The match is on the second Q ID, so nothing may assume the first
		expect( outlineEventContext( musicianOutline, 'Q177220' ) ).toEqual( {
			qids: [ 'Q639669', 'Q177220' ],
			matched_qid: 'Q177220',
			title: 'Wikipedia:Article guidance/Musician'
		} );
	} );

	it( 'reports a single-type outline the same way', () => {
		expect( outlineEventContext( companyOutline, 'Q4830453' ) ).toEqual( {
			qids: [ 'Q4830453' ],
			matched_qid: 'Q4830453',
			title: 'Wikipedia:Article guidance/Company'
		} );
	} );

	it( 'reports no match when the user browsed to the outline', () => {
		// No Q ID is singled out: the user picked an outline covering both
		expect( outlineEventContext( musicianOutline, null ) ).toEqual( {
			qids: [ 'Q639669', 'Q177220' ],
			matched_qid: null,
			title: 'Wikipedia:Article guidance/Musician'
		} );
	} );

	it( 'reports the generic outline as the sentinel with no match', () => {
		expect( outlineEventContext( genericOutline, null ) ).toEqual( {
			qids: [ '*' ],
			matched_qid: null,
			title: 'Wikipedia:Article guidance/General'
		} );
	} );

	it( 'reports empty qids when there is no outline', () => {
		expect( outlineEventContext( null, null ) ).toEqual( {
			qids: [],
			matched_qid: null,
			title: null
		} );
	} );
} );
/* eslint-enable camelcase */
