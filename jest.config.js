'use strict';

module.exports = {
	testEnvironment: 'jsdom',
	testMatch: [ '**/tests/jest/**/*.test.js' ],
	setupFiles: [ './tests/jest/setup.js' ]
};
