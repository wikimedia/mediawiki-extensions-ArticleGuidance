/**
 * Search for the article types of a new outline on Special:Outlines, then open
 * the outline builder for them.
 */

const Vue = require( 'vue' );
const CustomTypes = require( './CustomTypes.vue' );

const customContainer = document.getElementById( 'mw-articleguidance-outlines-custom' );
if ( customContainer ) {
	Vue.createMwApp( {
		render: () => Vue.h( CustomTypes, {
			language: mw.config.get( 'wgUserLanguage' ),
			onContinue: ( qIds ) => {
				window.location.href = mw.util.getUrl( 'Special:Outlines/' + qIds.join( ',' ) );
			}
		} )
	} ).mount( customContainer );
}
