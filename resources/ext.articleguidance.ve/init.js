if ( !mw.util.getParamValue( 'articleguidance' ) ) {
	return;
}

mw.hook( 've.newTarget' ).add( ( target ) => {
	target.saveFields.articleguidance = () => 1;

	mw.trackSubscribe( 'editAttemptStep', ( name, data ) => {
		if ( data.action === 'saveSuccess' ) {
			mw.storage.session.setObject( 'articleguidance-published', {
				title: mw.config.get( 'wgPageName' )
			} );
		}
	} );
} );
