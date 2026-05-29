'use strict';

const {
	getMissingTypeFeedbackUrl
} = require( '../../../resources/ext.articleguidance.newarticle/utils/missingTypeFeedback.js' );

describe( 'getMissingTypeFeedbackUrl', () => {
	it( 'builds a new-topic URL for the Article guidance talk page', () => {
		expect( getMissingTypeFeedbackUrl( 'Foo', 'testwiki' ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&preloadtitle=Couldn%27t+find+a+matching+article+type+when+creating+article+%22Foo%22+on+testwiki'
		);
	} );
} );
