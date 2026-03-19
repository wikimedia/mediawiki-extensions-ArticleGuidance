'use strict';

const {
	getMissingTypeFeedbackUrl
} = require( '../../../resources/ext.articleguidance.newarticle/utils/missingTypeFeedback.js' );

describe( 'getMissingTypeFeedbackUrl', () => {
	it( 'builds a new-topic URL for the Article guidance talk page', () => {
		expect( getMissingTypeFeedbackUrl() ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&preloadtitle=Couldn%27t+find+a+matching+article+type'
		);
	} );
} );
