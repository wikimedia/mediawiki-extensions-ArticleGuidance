const Vue = require( 'vue' );
const App = require( './App.vue' );

const container = document.getElementById( 'ext-articleguidance-outlinebuilder' );
if ( container ) {
	const types = JSON.parse( container.getAttribute( 'data-types' ) || '[]' );
	if ( types.length > 0 ) {
		Vue.createMwApp( App, {
			types,
			pagePrefix: container.getAttribute( 'data-page-prefix' ) || '',
			defaultPageName: container.getAttribute( 'data-page-name' ) || ''
		} ).mount( container );
	}
}
