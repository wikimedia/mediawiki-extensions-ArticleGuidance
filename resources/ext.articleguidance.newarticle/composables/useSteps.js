const { ref } = require( 'vue' );

/**
 * Composable for managing multi-step wizard navigation
 * Uses a simple history stack approach for back navigation
 *
 * @return {Object} Object containing step navigation state and methods
 */
function useSteps() {
	const currentStep = ref( 'search' );
	const history = ref( [ 'search' ] );

	/**
	 * Navigate to a specific step
	 *
	 * @param {string} stepName - Name of the step to navigate to
	 */
	function goTo( stepName ) {
		currentStep.value = stepName;
		history.value.push( stepName );
	}

	/**
	 * Go back to the previous step in history
	 */
	function back() {
		if ( history.value.length > 1 ) {
			history.value.pop();
			currentStep.value = history.value[ history.value.length - 1 ];
		}
	}

	return {
		currentStep,
		history,
		goTo,
		back,
		// Named navigation functions
		goToSearch: () => goTo( 'search' ),
		goToOutlines: () => goTo( 'outlines' ),
		goToSources: () => goTo( 'sources' ),
		goToInstructions: () => goTo( 'instructions' )
	};
}

module.exports = {
	useSteps
};
