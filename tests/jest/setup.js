'use strict';

const configValues = {
	wgArticleGuidanceJuniorEditorThreshold: 10,
	wgArticleGuidanceCrossWikiThreshold: 5,
	wgWikiID: 'testwiki'
};

global.mw = {
	config: {
		get: ( key ) => key in configValues ? configValues[ key ] : null
	}
};
