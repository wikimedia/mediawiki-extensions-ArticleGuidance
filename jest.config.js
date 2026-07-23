'use strict';

module.exports = {
	testEnvironment: 'jsdom',
	testMatch: [ '**/tests/jest/**/*.test.js' ],
	setupFiles: [ './tests/jest/setup.js' ],
	// ResourceLoader resolves a module name in require()
	moduleNameMapper: {
		'^ext\\.articleguidance\\.common$': '<rootDir>/resources/ext.articleguidance.common/index.js'
	}
};
