const data = mw.storage.session.getObject( 'articleguidance-published' );
if ( data && data.title === mw.config.get( 'wgPageName' ) ) {
	mw.storage.session.remove( 'articleguidance-published' );
	const Vue = require( 'vue' );
	const PublishFollowUp = require( './PublishFollowUp.vue' );
	const panel = document.createElement( 'div' );
	document.body.appendChild( panel );
	Vue.createMwApp( PublishFollowUp ).mount( panel );
}
