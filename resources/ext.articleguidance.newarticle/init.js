const Vue = require( 'vue' );
const App = require( './App.vue' );

const container = document.getElementById( 'content' );
if ( container ) {
	const initialTitle = ( mw.util.getParamValue( 'newarticletitle' ) || '' ).replace( /_/g, ' ' );
	Vue.createMwApp( App, { initialTitle } ).mount( container );
}
