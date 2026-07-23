'use strict';

const {
	toTypeEntries
} = require( '../../../resources/ext.articleguidance.outlinebuilder/outlineMapping.js' );

describe( 'toTypeEntries', () => {
	it( 'makes one entry for each type of each outline', () => {
		const outlines = [
			{
				title: 'Project:Article guidance/Musician',
				articleTypes: [
					{ id: 'Q639669', matchVia: 'P106', hierarchyDepth: 4 },
					{ id: 'Q177220', matchVia: 'P106', hierarchyDepth: 5 }
				]
			},
			{
				title: 'Project:Article guidance/Book',
				articleTypes: [ { id: 'Q571', matchVia: null, hierarchyDepth: 7 } ]
			}
		];
		expect( toTypeEntries( outlines ) ).toEqual( [
			{ articleType: 'Q639669', matchVia: 'P106', hierarchyDepth: 4 },
			{ articleType: 'Q177220', matchVia: 'P106', hierarchyDepth: 5 },
			{ articleType: 'Q571', matchVia: null, hierarchyDepth: 7 }
		] );
	} );

	it( 'makes no entry for an outline without types', () => {
		const outlines = [ { title: 'Project:Article guidance/Generic', articleTypes: [] } ];
		expect( toTypeEntries( outlines ) ).toEqual( [] );
	} );
} );
