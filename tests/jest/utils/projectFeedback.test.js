'use strict';

const mockConfig = {
	ArticleGuidanceFeedbackTalkPage: ''
};

jest.mock(
	'../../../resources/ext.articleguidance.newarticle/config.json',
	() => mockConfig,
	{ virtual: true }
);

const {
	getMissingTypeFeedbackUrl,
	getRequestSupportUrl
} = require( '../../../resources/ext.articleguidance.newarticle/utils/projectFeedback.js' );

beforeEach( () => {
	mockConfig.ArticleGuidanceFeedbackTalkPage = '';
} );

describe( 'getMissingTypeFeedbackUrl', () => {
	it( 'builds a local new-topic URL when the wiki has a feedback talk page', () => {
		mockConfig.ArticleGuidanceFeedbackTalkPage = 'Dyskusja Wikipedii:Pomoc redaktorska';

		expect( getMissingTypeFeedbackUrl( 'Foo' ) ).toBe(
			'/wiki/Dyskusja_Wikipedii:Pomoc_redaktorska?action=edit&section=new&dtpreload=1&preloadtitle=articleguidance-feedback-missing-type-preloadtitle%3AFoo'
		);
	} );

	it( 'keeps non-Latin talk page titles intact', () => {
		mockConfig.ArticleGuidanceFeedbackTalkPage = 'নিবন্ধ আলোচনা:নির্দেশিকা';

		expect( getMissingTypeFeedbackUrl( 'কলকাতা' ) ).toBe(
			'/wiki/%E0%A6%A8%E0%A6%BF%E0%A6%AC%E0%A6%A8%E0%A7%8D%E0%A6%A7_%E0%A6%86%E0%A6%B2%E0%A7%8B%E0%A6%9A%E0%A6%A8%E0%A6%BE:%E0%A6%A8%E0%A6%BF%E0%A6%B0%E0%A7%8D%E0%A6%A6%E0%A7%87%E0%A6%B6%E0%A6%BF%E0%A6%95%E0%A6%BE?action=edit&section=new&dtpreload=1&preloadtitle=articleguidance-feedback-missing-type-preloadtitle%3A%E0%A6%95%E0%A6%B2%E0%A6%95%E0%A6%BE%E0%A6%A4%E0%A6%BE'
		);
	} );

	it( 'falls back to an English heading on mediawiki.org when none is configured', () => {
		expect( getMissingTypeFeedbackUrl( 'Foo' ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&dtpreload=1&preloadtitle=Couldn%27t+find+a+matching+article+type+for+%22Foo%22+%28testwiki%29'
		);
	} );
} );

describe( 'getRequestSupportUrl', () => {
	it( 'builds a request-for-support URL with the selected result', () => {
		mockConfig.ArticleGuidanceFeedbackTalkPage = 'Wikipedia talk:Article Guidance';

		expect( getRequestSupportUrl( { label: 'Bar', id: 'Q123' } ) ).toBe(
			'/wiki/Wikipedia_talk:Article_Guidance?action=edit&section=new&dtpreload=1&preloadtitle=articleguidance-feedback-request-support-preloadtitle%3ABar%7CQ123'
		);
	} );

	it( 'falls back to a generic heading when no result is selected', () => {
		expect( getRequestSupportUrl( null ) ).toBe(
			'https://www.mediawiki.org/wiki/Talk:Article_guidance?action=edit&section=new&dtpreload=1&preloadtitle=Request+for+support+%28testwiki%29'
		);
	} );
} );
