const Vue = require( 'vue' );
const { createPinia } = require( 'pinia' );
const App = require( './App.vue' );
const instrument = require( './logging/instrument.js' );

const container = document.getElementById( 'content' );
if ( container ) {
	const initialTitle = ( mw.util.getParamValue( 'newarticletitle' ) || '' ).replace( /_/g, ' ' );
	instrument.logInit( initialTitle, mw.util.getParamValue( 'source' ) );
	Vue.createMwApp( App, { initialTitle } )
		.use( createPinia() )
		.mount( container );
}
