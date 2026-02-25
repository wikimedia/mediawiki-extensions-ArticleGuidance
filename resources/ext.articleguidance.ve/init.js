mw.hook( 've.newTarget' ).add( ( target ) => {
	if ( mw.util.getParamValue( 'articleguidance' ) ) {
		target.saveFields.articleguidance = () => 1;
	}
} );
