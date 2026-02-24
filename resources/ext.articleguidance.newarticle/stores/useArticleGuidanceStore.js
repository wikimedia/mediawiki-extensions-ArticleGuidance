const { defineStore } = require( 'pinia' );
const { ref, computed } = require( 'vue' );
const { fetchOutlines } = require( '../api/Outlines.js' );

const useArticleGuidanceStore = defineStore( 'articleGuidance', () => {
	const currentStep = ref( 'search' );
	const history = ref( [ 'search' ] );
	const searchQuery = ref( '' );
	const selectedResult = ref( null );
	const selectedOutline = ref( null );
	const references = ref( [] );
	const outlines = ref( null );
	const outlinesLoading = ref( false );
	const outlinesError = ref( null );
	const outlinesList = computed( () => outlines.value || [] );

	function goTo( step ) {
		currentStep.value = step;
		history.value.push( step );
	}

	let loadingPromise = null;

	async function loadOutlines() {
		if ( outlines.value !== null ) {
			return outlines.value;
		}
		if ( loadingPromise ) {
			return loadingPromise;
		}

		outlinesLoading.value = true;
		outlinesError.value = null;

		loadingPromise = ( async () => {
			try {
				const data = await fetchOutlines();
				outlines.value = data;
				return data;
			} catch ( err ) {
				outlinesError.value = err;
				throw err;
			} finally {
				outlinesLoading.value = false;
				loadingPromise = null;
			}
		} )();

		return loadingPromise;
	}

	async function selectArticle( result ) {
		selectedResult.value = result;
		searchQuery.value = result.label;

		const allOutlines = await loadOutlines();
		const matchedOutline = allOutlines.find(
			( o ) => o.articleType === result.matchedQId
		);
		selectedOutline.value = matchedOutline;
		goTo( 'sources' );
	}

	function browseOutlines() {
		selectedResult.value = null;
		goTo( 'outlines' );
	}

	function selectOutline( outline ) {
		selectedOutline.value = outline;
		goTo( 'sources' );
	}

	function setReferences( refs ) {
		references.value = refs;
	}

	function setSearchQuery( query ) {
		searchQuery.value = query;
	}

	function confirmSources() {
		goTo( 'instructions' );
	}

	function goBack() {
		if ( history.value.length > 1 ) {
			history.value.pop();
			currentStep.value = history.value[ history.value.length - 1 ];
		}
	}

	return {
		currentStep,
		searchQuery,
		selectedResult,
		selectedOutline,
		references,
		outlines,
		outlinesList,
		outlinesLoading,
		outlinesError,
		loadOutlines,
		selectArticle,
		browseOutlines,
		selectOutline,
		setReferences,
		setSearchQuery,
		confirmSources,
		goBack
	};
} );

module.exports = useArticleGuidanceStore;
