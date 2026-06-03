'use strict';

const {
	getMissingTypeFeedbackUrl,
	getRequestSupportUrl
} = require( '../../../resources/ext.articleguidance.newarticle/utils/projectFeedback.js' );

describe( 'getMissingTypeFeedbackUrl', () => {
	it( 'builds a new-topic URL for the Article guidance talk page', () => {
		expect( getMissingTypeFeedbackUrl( 'Foo' ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&dtpreload=1&preloadtitle=Couldn%27t+find+a+matching+article+type+when+creating+article+%22Foo%22+on+testwiki'
		);
	} );
} );

describe( 'getRequestSupportUrl', () => {
	it( 'builds a request-for-support URL with the selected result', () => {
		expect( getRequestSupportUrl( { label: 'Bar', id: 'Q123' } ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&dtpreload=1&preloadtitle=Request+for+support%3A+Bar+%28Q123%29+on+testwiki'
		);
	} );

	it( 'falls back to a generic title when no result is selected', () => {
		expect( getRequestSupportUrl( null ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&dtpreload=1&preloadtitle=Request+for+support'
		);
	} );
} );
