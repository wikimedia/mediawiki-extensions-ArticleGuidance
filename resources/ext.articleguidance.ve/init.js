// Article Guidance and Visual Editor integration:
// 1. Edit check suggestions mode does not work well with preloaded outlines
//    at this stage, so suggestions are suppressed.
// 2. Preloaded outlines cause VE to consider the document edited before loading
//    (fromEditedState), which enables the save button immediately. Reset
//    fromEditedState so the save button stays disabled until the user modifies it.

if ( mw.util.getParamValue( 'articleguidance' ) !== '1' ) {
	return;
}

function setupTarget( target ) {
	if ( target.editcheckController ) {
		target.editcheckController.suppressSuggestionDisplay( true );
	}

	target.fromEditedState = false;
	target.updateToolbarSaveButtonState();
}

mw.hook( 've.newTarget' ).add( ( target ) => {
	// Re-apply on every surface (re)load.
	target.on( 'surfaceReady', () => setupTarget( target ) );
	// surfaceReady (unlike the ve.newTarget hook) is not replayed to late
	// subscribers, so if this module loaded after the surface was already
	// ready, act immediately rather than waiting for an event that has passed.
	if ( target.getSurface() ) {
		setupTarget( target );
	}
} );
