// Article Guidance and Visual Editor integration:
// 1. Edit check suggestions mode does not work well with preloaded outlines
//    at this stage, so suggestions are suppressed.
// 2. Preloaded outlines cause VE to consider the document edited before loading
//    (fromEditedState), which enables the save button immediately. Reset
//    fromEditedState so the save button stays disabled until the user modifies it.
// 3. VE also reads fromEditedState to decide whether a switch to the wikitext
//    editor has content to carry over. Without it, the switch to the classic
//    wikitext editor reloads the empty page, and the outline and references
//    are lost (T445973). Always switch with the content.

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

function keepContentOnSwitch( target ) {
	const switchToWikitextEditor = target.switchToWikitextEditor;
	// Callers pass false when they assume an unchanged page can be reloaded,
	// e.g. the welcome dialog. Here the preloaded outline is the content.
	target.switchToWikitextEditor = function () {
		return switchToWikitextEditor.call( this, true );
	};
}

mw.hook( 've.newTarget' ).add( ( target ) => {
	keepContentOnSwitch( target );
	// Re-apply on every surface (re)load.
	target.on( 'surfaceReady', () => setupTarget( target ) );
	// surfaceReady (unlike the ve.newTarget hook) is not replayed to late
	// subscribers, so if this module loaded after the surface was already
	// ready, act immediately rather than waiting for an event that has passed.
	if ( target.getSurface() ) {
		setupTarget( target );
	}
} );
