const { defineStore } = require( 'pinia' );
const { ref, computed } = require( 'vue' );
const { fetchOutlines } = require( '../api/Outlines.js' );
const { fetchLocalArticleData } = require( '../api/MediaWiki.js' );
const { evaluateNotabilityTags } = require( '../utils/notability.js' );
const { reportNotabilityEvaluation } = require( '../logging/notability.js' );
const { getDraftTitle } = require( '../utils/draft.js' );

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
	const localArticle = ref( null );

	const localArticleInfo = computed( () => ( {
		title: ( localArticle.value && localArticle.value.title ) ||
			( selectedResult.value && selectedResult.value.localSitelink &&
			selectedResult.value.localSitelink.title ) || '',
		description: ( localArticle.value && localArticle.value.description ) ||
			( selectedResult.value && selectedResult.value.description ) || '',
		thumbnail: ( localArticle.value && localArticle.value.thumbnail ) ||
			( selectedResult.value && selectedResult.value.thumbnail ) || null
	} ) );

	const sitelinkCount = computed(
		() => selectedResult.value ? selectedResult.value.sitelinkCount : null
	);

	const topicExistsOnWiki = computed(
		() => !!( selectedResult.value && selectedResult.value.localSitelink )
	);

	const outlinesList = computed( () => ( outlines.value || [] )
		.slice()
		.sort( ( a, b ) => a.label.localeCompare( b.label ) )
	);
	const showOutlines = ref( false );

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

	async function loadLocalArticle() {
		localArticle.value = null;
		try {
			localArticle.value = await fetchLocalArticleData(
				selectedResult.value.localSitelink.title
			);
		} catch ( err ) {
			// Wikidata fallback data will be used instead
		}
	}

	async function selectArticle( result ) {
		selectedResult.value = result;

		const matchedOutline = outlines.value && outlines.value.find(
			( o ) => o.articleType === result.matchedQId
		);
		selectedOutline.value = matchedOutline;
		if ( topicExistsOnWiki.value ) {
			await loadLocalArticle();
			goTo( 'subjectcovered' );
		} else if ( shouldShowNotabilityStep() ) {
			goTo( 'notability' );
		} else {
			goTo( 'sources' );
		}
	}

	function browseOutlines() {
		selectedResult.value = null;
		showOutlines.value = true;
	}

	function hideOutlines() {
		showOutlines.value = false;
	}

	function selectOutline( outline ) {
		selectedOutline.value = outline;
		if ( shouldShowNotabilityStep() ) {
			goTo( 'notability' );
		} else {
			goTo( 'sources' );
		}
	}

	function setReferences( refs ) {
		references.value = refs;
	}

	function setSearchQuery( query ) {
		searchQuery.value = query;
	}

	function buildNotabilityState() {
		return {
			selectedWikidataItem: !!selectedResult.value,
			sitelinkCount: sitelinkCount.value,
			userEditCount: mw.config.get( 'wgUserEditCount' ) || 0
		};
	}

	function getActiveNotabilityTags() {
		const outline = selectedOutline.value;
		if ( !outline || !outline.notabilityRisk ) {
			return [];
		}
		const { tagResults } = evaluateNotabilityTags( outline, buildNotabilityState() );
		return tagResults.filter( ( r ) => r.active ).map( ( r ) => r.tag );
	}

	function shouldShowNotabilityStep() {
		const outline = selectedOutline.value;
		const state = buildNotabilityState();
		const { tagResults, willShow } = evaluateNotabilityTags( outline, state );
		reportNotabilityEvaluation( outline, tagResults, selectedResult.value );
		return willShow;
	}

	const minRequiredSources = computed( () => {
		const outline = selectedOutline.value;
		if ( outline && outline.notabilityRisk && outline.notabilityRisk.includes( 'sources' ) ) {
			return mw.config.get( 'wgArticleGuidanceSourcesThreshold' );
		}
		return 0;
	} );

	const creationTitle = computed( () => {
		if ( !getActiveNotabilityTags().includes( 'draft' ) ) {
			return searchQuery.value;
		}
		return getDraftTitle( searchQuery.value );
	} );

	function confirmNotability() {
		goTo( 'sources' );
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
		showOutlines,
		sitelinkCount,
		topicExistsOnWiki,
		localArticleInfo,
		minRequiredSources,
		creationTitle,
		getActiveNotabilityTags,
		shouldShowNotabilityStep,
		loadOutlines,
		selectArticle,
		browseOutlines,
		hideOutlines,
		selectOutline,
		setReferences,
		setSearchQuery,
		confirmNotability,
		confirmSources,
		goBack
	};
} );

module.exports = useArticleGuidanceStore;
