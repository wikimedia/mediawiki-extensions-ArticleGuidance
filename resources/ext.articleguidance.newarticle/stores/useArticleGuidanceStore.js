const { defineStore } = require( 'pinia' );
const { ref, computed } = require( 'vue' );
const { fetchOutlines } = require( '../api/Outlines.js' );
const { checkPagesExist, fetchLocalArticleData } = require( '../api/MediaWiki.js' );
const { fetchAllCitationsWikitext } = require( '../api/Citoid.js' );
const {
	evaluateNotabilityTags,
	getBlockingRestrictionType,
	isSourcesRequired
} = require( '../utils/notability.js' );
const { reportNotabilityEvaluation } = require( '../logging/notability.js' );
const { getDraftTitle } = require( '../utils/draft.js' );
const { getCreateArticleUrl } = require( '../utils/articleUrl.js' );
const instrument = require( '../logging/instrument.js' );

const useArticleGuidanceStore = defineStore( 'articleGuidance', () => {
	const currentStep = ref( 'search' );
	const searchQuery = ref( '' );
	const selectedResult = ref( null );
	const selectedOutline = ref( null );
	const references = ref( [] );
	const outlines = ref( null );
	const outlinesLoading = ref( false );
	const outlinesError = ref( null );
	const localArticle = ref( null );
	const articleTitle = ref( null );
	const titleSuggestion = ref( null );
	const originalTypedTitle = ref( null );

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
		window.history.pushState( { agStep: step }, '' );
	}

	let loadingPromise = null;
	let citationWikitextsPromise = null;

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

	async function findTitleSuggestion( result ) {
		const candidates = [];

		if ( result && result.label &&
			result.label.toLowerCase() !== searchQuery.value.toLowerCase() ) {
			candidates.push( result.label );
		}

		if ( selectedOutline.value && selectedOutline.value.label ) {
			candidates.push( searchQuery.value + ' (' + selectedOutline.value.label + ')' );
		}

		if ( candidates.length === 0 ) {
			return null;
		}

		const existenceMap = await checkPagesExist( candidates );

		for ( let i = 0; i < candidates.length; i++ ) {
			if ( !existenceMap[ candidates[ i ] ] ) {
				return candidates[ i ];
			}
		}

		return null;
	}

	/**
	 * Navigate to the title conflict step if the given title already exists
	 * on the local wiki.
	 *
	 * @param {string} title Title to check on the local wiki
	 * @param {Object|null} result Selected Wikidata result, when available
	 * @return {Promise<boolean>} Whether a conflict was found and handled
	 */
	async function routeIfTitleTaken( title, result ) {
		const trimmed = title && title.trim();
		if ( !trimmed ) {
			return false;
		}
		const existenceMap = await checkPagesExist( [ trimmed ] );
		if ( !existenceMap[ trimmed ] ) {
			return false;
		}
		articleTitle.value = trimmed;
		titleSuggestion.value = await findTitleSuggestion( result );
		goTo( 'titleconflict' );
		return true;
	}

	async function selectArticle( result, titleTaken ) {
		articleTitle.value = null;
		titleSuggestion.value = null;
		originalTypedTitle.value = null;
		if ( selectedResult.value === null || selectedResult.value.id !== result.id ) {
			references.value = [];
		}
		selectedResult.value = result;

		const matchedOutline = outlines.value && outlines.value.find(
			( o ) => o.articleType === result.matchedQId
		);
		selectedOutline.value = matchedOutline;
		if ( topicExistsOnWiki.value ) {
			await loadLocalArticle();
			goTo( 'subjectcovered' );
		} else if ( titleTaken ) {
			articleTitle.value = searchQuery.value;
			titleSuggestion.value = await findTitleSuggestion( result );
			goTo( 'titleconflict' );
		} else if ( !result.matchedQId ) {
			goTo( 'unsupportedsubject' );
		} else {
			if ( result.label &&
				result.label.toLowerCase() !== searchQuery.value.toLowerCase() ) {
				if ( await routeIfTitleTaken( result.label, result ) ) {
					return;
				}
				originalTypedTitle.value = searchQuery.value;
				articleTitle.value = result.label;
			}
			if ( shouldShowNotabilityStep() ) {
				goTo( 'notability' );
			} else {
				goTo( 'sources' );
			}
		}
	}

	function browseOutlines() {
		selectedResult.value = null;
		showOutlines.value = true;
		// Treat the outlines panel as a pushed history entry so the browser
		// back button dismisses it (back to the results list), mirroring how
		// it feels like a step to the user.
		window.history.pushState( { agStep: 'search', agOutlines: true }, '' );
	}

	function hideOutlines() {
		// Pop the entry pushed by browseOutlines() rather than mutating the
		// flag directly, keeping the history stack in sync; the popstate
		// handler clears showOutlines. Guard so we never navigate away when
		// no outlines entry was pushed.
		if ( showOutlines.value ) {
			window.history.back();
		}
	}

	async function selectOutline( outline ) {
		const currentQId = selectedOutline.value && selectedOutline.value.articleType;
		if ( currentQId !== outline.articleType ) {
			references.value = [];
		}
		selectedOutline.value = outline;
		articleTitle.value = null;
		titleSuggestion.value = null;
		originalTypedTitle.value = null;
		if ( await routeIfTitleTaken( searchQuery.value, null ) ) {
			return;
		}
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

	function getBlockingRestriction() {
		return getBlockingRestrictionType( getActiveNotabilityTags() );
	}

	const minRequiredSources = computed( () => {
		if ( !isSourcesRequired( selectedOutline.value, buildNotabilityState() ) ) {
			return 0;
		}
		return mw.config.get( 'wgArticleGuidanceSourcesThreshold' );
	} );

	const creationTitle = computed( () => {
		const title = articleTitle.value || searchQuery.value;
		if ( !getActiveNotabilityTags().includes( 'draft' ) ) {
			return title;
		}
		return getDraftTitle( title );
	} );

	const hasInstructions = computed( () => !!( selectedOutline.value &&
		selectedOutline.value.instructions &&
		String( selectedOutline.value.instructions ).trim() ) );

	/**
	 * Navigate to the editor to start writing the article.
	 *
	 * Builds the VisualEditor preload URL from the chosen title, outline and
	 * gathered references, logs the write_start event, and redirects. Shared by
	 * the instructions step and, when there is no guidance to show, the sources
	 * step.
	 */
	async function startWriting() {
		instrument.logWriteStart( {
			title: selectedOutline.value && selectedOutline.value.title,
			qid: selectedOutline.value && selectedOutline.value.articleType
		} );

		// Resolve Citoid wikitext for each reference. The promise is normally
		// pre-started in SourcesStep (often already resolved by the time the
		// user clicks); fall back to a fresh fetch if it is absent. Each entry
		// is Citoid-formatted wikitext or null, so fall back to the raw URL
		// per-reference.
		const urls = references.value.map( ( r ) => r.url );
		const wikitexts = await ( citationWikitextsPromise || fetchAllCitationsWikitext( urls ) );
		const refs = urls.map( ( url, i ) => ( wikitexts && wikitexts[ i ] ) || url );

		location.href = getCreateArticleUrl(
			creationTitle.value,
			selectedOutline.value.title,
			refs,
			selectedResult.value && selectedResult.value.id
		);
	}

	function setArticleTitle( title ) {
		articleTitle.value = title;
	}

	function confirmTitle() {
		if ( selectedResult.value && !selectedResult.value.matchedQId ) {
			goTo( 'unsupportedsubject' );
		} else if ( shouldShowNotabilityStep() ) {
			goTo( 'notability' );
		} else {
			goTo( 'sources' );
		}
	}

	function resetTitleConflict() {
		articleTitle.value = null;
		titleSuggestion.value = null;
	}

	function confirmNotability() {
		goTo( 'sources' );
	}

	function confirmSources() {
		if ( hasInstructions.value ) {
			goTo( 'instructions' );
		} else {
			startWriting();
		}
	}

	function setCitationWikitextsPromise( promise ) {
		citationWikitextsPromise = promise;
	}

	function getCitationWikitextsPromise() {
		return citationWikitextsPromise;
	}

	function goToUpdateTitle() {
		goTo( 'updatetitle' );
	}

	function goBack() {
		window.history.back();
	}

	// Take over scroll handling from the browser. Otherwise, navigating back
	// (e.g. dismissing the outlines panel) restores the previous entry's scroll
	// position after our scrollToTop() runs, leaving the user partway down the
	// list. Every step transition explicitly scrolls to the top instead.
	if ( 'scrollRestoration' in window.history ) {
		window.history.scrollRestoration = 'manual';
	}

	window.history.replaceState( { agStep: 'search' }, '' );

	window.addEventListener( 'popstate', ( event ) => {
		if ( event.state && event.state.agStep ) {
			currentStep.value = event.state.agStep;
			showOutlines.value = !!event.state.agOutlines;
		}
	} );

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
		articleTitle,
		titleSuggestion,
		originalTypedTitle,
		creationTitle,
		hasInstructions,
		getActiveNotabilityTags,
		getBlockingRestriction,
		shouldShowNotabilityStep,
		loadOutlines,
		selectArticle,
		browseOutlines,
		hideOutlines,
		selectOutline,
		setReferences,
		setSearchQuery,
		setArticleTitle,
		confirmTitle,
		resetTitleConflict,
		confirmNotability,
		confirmSources,
		startWriting,
		setCitationWikitextsPromise,
		getCitationWikitextsPromise,
		goToUpdateTitle,
		goBack
	};
} );

module.exports = useArticleGuidanceStore;
