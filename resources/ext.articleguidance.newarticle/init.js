const Vue = require( 'vue' );
const { createPinia } = require( 'pinia' );
const App = require( './App.vue' );
const instrument = require( './logging/instrument.js' );

const container = document.getElementById( 'content' );
if ( container ) {
	const initialTitle = ( mw.util.getParamValue( 'newarticletitle' ) || '' ).replace( /_/g, ' ' );
	const source = mw.util.getParamValue( 'source' ) || '';
	instrument.logInit( initialTitle, source );
	Vue.createMwApp( App, { initialTitle, source } )
		.use( createPinia() )
		.mount( container );
}
