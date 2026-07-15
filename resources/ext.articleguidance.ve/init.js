// Article Guidance and Visual Editor Edit check suggestions mode
// don't work well together at this stage.
// When loaded on the edit page following the AG workflow, this script
// suppresses the suggestions.

if ( mw.util.getParamValue( 'articleguidance' ) !== '1' ) {
	return;
}

function suppressSuggestions( target ) {
	if ( target.editcheckController ) {
		target.editcheckController.suppressSuggestionDisplay( true );
	}
}

mw.hook( 've.newTarget' ).add( ( target ) => {
	// Re-apply on every surface (re)load.
	target.on( 'surfaceReady', () => suppressSuggestions( target ) );
	// surfaceReady (unlike the ve.newTarget hook) is not replayed to late
	// subscribers, so if this module loaded after the surface was already
	// ready, act immediately rather than waiting for an event that has passed.
	if ( target.getSurface() ) {
		suppressSuggestions( target );
	}
} );
