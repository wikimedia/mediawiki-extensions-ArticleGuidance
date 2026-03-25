mw.hook( 've.newTarget' ).add( ( target ) => {
	if ( mw.util.getParamValue( 'articleguidance' ) ) {
		target.saveFields.articleguidance = () => 1;
		mw.hook( 'postEdit' ).add( () => {
			mw.storage.session.setObject( 'articleguidance-published', {
				title: mw.config.get( 'wgPageName' )
			} );
		} );
	}
} );
