'use strict';

const configValues = {
	wgArticleGuidanceJuniorEditorThreshold: 10,
	wgArticleGuidanceCrossWikiThreshold: 5
};

global.mw = {
	config: {
		get: ( key ) => key in configValues ? configValues[ key ] : null
	}
};
