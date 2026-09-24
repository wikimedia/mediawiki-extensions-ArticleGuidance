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
const {
	findGenericOutline,
	selectOutlineForResult,
	outlineEventContext
} = require( '../utils/outlineSelection.js' );
const { getCreateArticleUrl } = require( '../utils/articleUrl.js' );
const instrument = require( '../logging/instrument.js' );

const useArticleGuidanceStore = defineStore( 'articleGuidance', () => {
	const currentStep = ref( 'search' );
	const searchQuery = ref( '' );
	// Title-building and comparisons use the query without surrounding whitespace
	const trimmedQuery = computed( () => ( searchQuery.value || '' ).trim() );
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
	const redLinkTitle = ref( null );
	const isRedLink = computed( () => redLinkTitle.value !== null );

	// The generic outline is not a type of article, so it is never named as one
	// in the interface. This is true for the wiki's own generic outline and for
	// the default one.
	const isGenericOutlineSelected = computed(
		() => !!( selectedOutline.value && selectedOutline.value.generic )
	);
	// The default outline is the generic outline that the server builds from
	// i18n messages when the wiki has none (T437432). Unlike the wiki's own, it
	// is not written by the wiki's editors, so the interface does not credit
	// them for it.
	const isDefaultOutlineSelected = computed(
		() => !!( selectedOutline.value && selectedOutline.value.default )
	);

	const localArticleInfo = computed( () => ( {
		title: ( localArticle.value && localArticle.value.title ) ||
			( selectedResult.value && selectedResult.value.localSitelink &&
			selectedResult.value.localSitelink.title ) || '',
		description: ( localArticle.value && localArticle.value.description ) ||
			( selectedResult.value && selectedResult.value.description ) || '',
		thumbnail: ( localArticle.value && localArticle.value.thumbnail ) ||
			( selectedResult.value && selectedResult.value.thumbnail ) || null,
		outlineName: ( selectedResult.value && selectedResult.value.outlineName ) ||
			( !isGenericOutlineSelected.value && selectedOutline.value &&
			selectedOutline.value.label ) || null
	} ) );

	const sitelinkCount = computed(
		() => selectedResult.value ? selectedResult.value.sitelinkCount : null
	);

	const topicExistsOnWiki = computed(
		() => !!( selectedResult.value && selectedResult.value.localSitelink )
	);

	// The browse panel lists types of article, so the generic outline stays out
	// of it. The panel shows it on a separate card instead.
	const outlinesList = computed( () => ( outlines.value || [] )
		.filter( ( outline ) => !outline.generic )
		.sort( ( a, b ) => a.label.localeCompare( b.label ) )
	);
	// The server always serves a generic outline: the wiki's own, or the
	// default one (T437432). It is null only until the outlines load.
	const genericOutline = computed( () => findGenericOutline( outlines.value ) );
	const hasTypedOutlines = computed( () => outlinesList.value.length > 0 );
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
				// The server always adds a generic outline (T437432), and the
				// workflow relies on it. A payload without one comes from an
				// older server, for example from the CDN cache during a
				// deploy. Reject it, so that the search step shows its retry
				// state instead of a step with no outline.
				if ( !findGenericOutline( data ) ) {
					throw new Error( 'Outlines have no generic outline' );
				}
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
			result.label.toLowerCase() !== trimmedQuery.value.toLowerCase() ) {
			candidates.push( result.label );
		}

		// The generic outline's label is not a disambiguator. It would give
		// titles such as "Paris (General guidance)".
		if ( !isGenericOutlineSelected.value &&
			selectedOutline.value && selectedOutline.value.label ) {
			candidates.push( trimmedQuery.value + ' (' + selectedOutline.value.label + ')' );
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
		const titleObj = mw.Title.newFromUserInput( result.label );
		const label = titleObj ? titleObj.getMainText() : null;
		articleTitle.value = null;
		titleSuggestion.value = null;
		originalTypedTitle.value = null;
		if ( selectedResult.value === null || selectedResult.value.id !== result.id ) {
			references.value = [];
		}
		selectedResult.value = result;

		selectedOutline.value = selectOutlineForResult( outlines.value, result.matchedQId );
		if ( topicExistsOnWiki.value ) {
			await loadLocalArticle();
			goTo( 'subjectcovered' );
		} else if ( titleTaken ) {
			articleTitle.value = trimmedQuery.value;
			titleSuggestion.value = await findTitleSuggestion( result );
			goTo( 'titleconflict' );
		} else {
			if ( !isRedLink.value && label &&
				label.toLowerCase() !== trimmedQuery.value.toLowerCase() ) {
				if ( await routeIfTitleTaken( label, result ) ) {
					return;
				}
				originalTypedTitle.value = trimmedQuery.value;
				articleTitle.value = label;
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
		// Compare by page title: it uniquely identifies an outline, unlike a
		// Q ID, which is one of possibly several (T421260)
		const currentTitle = selectedOutline.value && selectedOutline.value.title;
		if ( currentTitle !== outline.title ) {
			references.value = [];
		}
		// The user picks the outline, so a result selected earlier no longer applies
		selectedResult.value = null;
		selectedOutline.value = outline;
		articleTitle.value = null;
		titleSuggestion.value = null;
		originalTypedTitle.value = null;
		if ( await routeIfTitleTaken( trimmedQuery.value, null ) ) {
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

	function setRedLinkOrigin( title ) {
		redLinkTitle.value = title;
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
		reportNotabilityEvaluation( outline, tagResults, willShow, selectedResult.value );
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
		const title = articleTitle.value || trimmedQuery.value;
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
		instrument.logWriteStart( outlineEventContext(
			selectedOutline.value,
			selectedResult.value && selectedResult.value.matchedQId
		) );

		// Resolve Citoid wikitext for each reference. The promise is normally
		// pre-started in SourcesStep (often already resolved by the time the
		// user clicks); fall back to a fresh fetch if it is absent. Each entry
		// is Citoid-formatted wikitext or null, so fall back to the raw URL
		// per-reference.
		const urls = references.value.map( ( r ) => r.url );
		const wikitexts = await ( citationWikitextsPromise || fetchAllCitationsWikitext( urls ) );
		const refs = urls.map( ( url, i ) => ( wikitexts && wikitexts[ i ] ) || url );

		// The outline page is the preload page. The default outline has no
		// page: its title is MediaWiki:Articleguidance-default-outline-preload,
		// and core preloads a MediaWiki page from the i18n message of the same
		// name (T437432).
		location.href = getCreateArticleUrl(
			creationTitle.value,
			selectedOutline.value.title,
			refs,
			selectedResult.value && selectedResult.value.id
		);
	}

	function setArticleTitle( title ) {
		articleTitle.value = title && title.trim();
	}

	function confirmTitle() {
		if ( shouldShowNotabilityStep() ) {
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
		trimmedQuery,
		selectedResult,
		selectedOutline,
		references,
		outlines,
		outlinesList,
		genericOutline,
		hasTypedOutlines,
		isGenericOutlineSelected,
		isDefaultOutlineSelected,
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
		redLinkTitle,
		isRedLink,
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
		setRedLinkOrigin,
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
