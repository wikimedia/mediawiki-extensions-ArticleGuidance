'use strict';

const { evaluateTag, evaluateNotabilityTags, getBlockingRestrictionType } = require( '../../../resources/ext.articleguidance.newarticle/utils/notability.js' );

const BASE_STATE = {
	selectedWikidataItem: false,
	sitelinkCount: null,
	userEditCount: 0
};

// ---------------------------------------------------------------------------
// evaluateTag — one case per branch per meaningful input combination
// ---------------------------------------------------------------------------

const tagCases = {
	'wikidata — no item selected → active': {
		tag: 'wikidata',
		state: { ...BASE_STATE, selectedWikidataItem: false },
		expected: { active: true }
	},
	'wikidata — item selected → inactive': {
		tag: 'wikidata',
		state: { ...BASE_STATE, selectedWikidataItem: true },
		expected: { active: false }
	},
	'crosswiki — no site links → active': {
		tag: 'crosswiki',
		state: { ...BASE_STATE, sitelinkCount: 0 },
		expected: { active: true }
	},
	'crosswiki — 3 site links (below default threshold of 5) → active': {
		tag: 'crosswiki',
		state: { ...BASE_STATE, sitelinkCount: 3 },
		expected: { active: true }
	},
	'crosswiki — 5 site links (meets default threshold of 5) → inactive': {
		tag: 'crosswiki',
		state: { ...BASE_STATE, sitelinkCount: 5 },
		expected: { active: false }
	},
	'crosswiki — 7 site links (above default threshold of 5) → inactive': {
		tag: 'crosswiki',
		state: { ...BASE_STATE, sitelinkCount: 7 },
		expected: { active: false }
	},
	'junior — 5 user edits (below threshold of 10) → active': {
		tag: 'junior',
		state: { ...BASE_STATE, userEditCount: 5 },
		expected: { active: true }
	},
	'junior — 10 user edits (at threshold of 10) → inactive': {
		tag: 'junior',
		state: { ...BASE_STATE, userEditCount: 10 },
		expected: { active: false }
	},
	'junior — 15 user edits (above threshold of 10) → inactive': {
		tag: 'junior',
		state: { ...BASE_STATE, userEditCount: 15 },
		expected: { active: false }
	},
	'draft — always active': {
		tag: 'draft',
		state: BASE_STATE,
		expected: { active: true }
	},
	'unknown tag → inactive': {
		tag: 'nonexistent',
		state: BASE_STATE,
		expected: { active: false }
	}
};

test.each( Object.entries( tagCases ) )( 'evaluateTag: %s', ( label, { tag, state, expected } ) => {
	const { active } = evaluateTag( tag, state );
	expect( active ).toBe( expected.active );
} );

// ---------------------------------------------------------------------------
// evaluateNotabilityTags — aggregation and willShow logic
// ---------------------------------------------------------------------------

const notabilityCases = {
	'outline with no tags → willShow false': {
		outline: { notabilityRisk: [] },
		state: BASE_STATE,
		expected: { activeTags: [], willShow: false }
	},
	'multiple tags, one active → willShow true': {
		outline: { notabilityRisk: [ 'wikidata', 'crosswiki' ] },
		state: { ...BASE_STATE, selectedWikidataItem: true, sitelinkCount: 3 },
		expected: { activeTags: [ 'crosswiki' ], willShow: true }
	},
	'only sources → willShow false': {
		outline: { notabilityRisk: [ 'sources' ] },
		state: BASE_STATE,
		expected: { activeTags: [], willShow: false }
	},
	'only junior → willShow false': {
		outline: { notabilityRisk: [ 'junior' ] },
		state: BASE_STATE,
		expected: { activeTags: [ 'junior' ], willShow: false }
	},
	'sources and junior → willShow false': {
		outline: { notabilityRisk: [ 'sources', 'junior' ] },
		state: BASE_STATE,
		expected: { activeTags: [ 'junior' ], willShow: false }
	},
	'multiple tags all inactive → willShow false': {
		outline: { notabilityRisk: [ 'wikidata', 'crosswiki' ] },
		state: { ...BASE_STATE, selectedWikidataItem: true, sitelinkCount: 10 },
		expected: { activeTags: [], willShow: false }
	},
	'multiple tags all inactive but draft → willShow true': {
		outline: { notabilityRisk: [ 'wikidata', 'crosswiki', 'draft' ] },
		state: { ...BASE_STATE, selectedWikidataItem: true, sitelinkCount: 10 },
		expected: { activeTags: [ 'draft' ], willShow: true }
	},
	'multiple tags active but not junior → willShow false': {
		outline: { notabilityRisk: [ 'wikidata', 'crosswiki', 'junior' ] },
		state: { ...BASE_STATE, selectedWikidataItem: false, userEditCount: 500 },
		expected: { activeTags: [ 'wikidata', 'crosswiki' ], willShow: false }
	},
	'multiple tags active including draft but not junior → willShow false': {
		outline: { notabilityRisk: [ 'wikidata', 'crosswiki', 'junior', 'draft' ] },
		state: { ...BASE_STATE, selectedWikidataItem: false, userEditCount: 500 },
		expected: { activeTags: [ 'wikidata', 'crosswiki', 'draft' ], willShow: false }
	}
};

test.each( Object.entries( notabilityCases ) )( 'evaluateNotabilityTags: %s', ( label, { outline, state, expected } ) => {
	const { tagResults, willShow } = evaluateNotabilityTags( outline, state );
	const activeTags = tagResults.filter( ( r ) => r.active ).map( ( r ) => r.tag );
	expect( activeTags ).toEqual( expected.activeTags );
	expect( willShow ).toBe( expected.willShow );
} );

// ---------------------------------------------------------------------------
// getBlockingRestrictionType — priority: crosswiki > wikidata > draft
// ---------------------------------------------------------------------------

const blockingCases = {
	'crosswiki takes priority over wikidata and draft': {
		activeTags: [ 'crosswiki', 'wikidata', 'draft' ],
		expected: 'crosswiki'
	},
	'crosswiki alone': {
		activeTags: [ 'crosswiki' ],
		expected: 'crosswiki'
	},
	'wikidata takes priority over draft': {
		activeTags: [ 'wikidata', 'draft' ],
		expected: 'wikidata'
	},
	'wikidata alone': {
		activeTags: [ 'wikidata' ],
		expected: 'wikidata'
	},
	'draft alone': {
		activeTags: [ 'draft' ],
		expected: 'draft'
	},
	'empty tags → null': {
		activeTags: [],
		expected: null
	},
	'only junior → null': {
		activeTags: [ 'junior' ],
		expected: null
	},
	'crosswiki and junior → crosswiki': {
		activeTags: [ 'crosswiki', 'junior' ],
		expected: 'crosswiki'
	}
};

test.each( Object.entries( blockingCases ) )( 'getBlockingRestrictionType: %s', ( label, { activeTags, expected } ) => {
	expect( getBlockingRestrictionType( activeTags ) ).toBe( expected );
} );
