<template>
	<step
		step-name="search"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="showOutlines"
		@back="handleHideOutlines"
	>
		<div class="ext-articleguidance-search-controls">
			<cdx-text-input
				ref="searchInput"
				v-model="searchQuery"
				:placeholder="$i18n( 'articleguidance-specialnewarticle-title-placeholder' ).text()"
				class="ext-articleguidance-search-input"
			>
			</cdx-text-input>
		</div>

		<!-- Inline outlines panel -->
		<outlines v-if="showOutlines"></outlines>

		<template v-if="!showOutlines">
			<div class="ext-articleguidance-results">
				<!-- Loading state -->
				<div v-if="loading">
					<cdx-progress-indicator show-label>
						{{ $i18n( 'articleguidance-specialnewarticle-checking' ).text() }}
					</cdx-progress-indicator>
				</div>

				<!-- Error state -->
				<div v-if="error" class="ext-articleguidance-inline-error">
					<span class="ext-articleguidance-inline-error-message">
						{{ $i18n( 'articleguidance-specialnewarticle-search-error' ).text() }}
					</span>
					<cdx-button
						class="ext-articleguidance-inline-error-retry"
						weight="quiet"
						action="progressive"
						@click="handleRetry"
					>
						{{ $i18n( 'articleguidance-specialnewarticle-search-retry' ).text() }}
					</cdx-button>
				</div>

				<!-- Results list -->
				<template v-if="showResults">
					<div class="ext-articleguidance-results-heading">
						{{
							$i18n( 'articleguidance-specialnewarticle-disambiguation-title' ).text()
						}}
					</div>
					<p
						v-if="hasFallbackLabels"
						class="ext-articleguidance-language-fallback-notice"
					>
						{{
							$i18n(
								'articleguidance-specialnewarticle-language-fallback-notice'
							).text()
						}}
					</p>
					<div class="ext-articleguidance-results-list">
						<article-card
							v-for="result in visibleResults"
							:key="result.id"
							:title="result.label"
							:description="result.description"
							:thumbnail="result.thumbnail"
							:outline-name="result.outlineName"
							:interactive="true"
							@click="handleSelect( result )"
						>
						</article-card>
					</div>
				</template>

				<!-- No results -->
				<state-message v-if="showNoResults">
					{{
						$i18n(
							'articleguidance-specialnewarticle-no-results',
							searchQuery
						).text()
					}}
				</state-message>
			</div>

			<!-- Footer: browse fallback and (for experienced editors) skip guidance -->
			<div
				v-if="showResults || showNoResults || error || showSkipGuidance"
				class="ext-articleguidance-search-footer"
			>
				<!-- Can't find option -->
				<div
					v-if="showResults || showNoResults || error"
					class="ext-articleguidance-browse"
				>
					<span class="ext-articleguidance-browse-prefix">
						{{
							$i18n(
								'articleguidance-specialnewarticle-browse-outlines-prefix'
							).text()
						}}
					</span>
					<cdx-button
						class="ext-articleguidance-browse-link"
						weight="quiet"
						action="progressive"
						@click="handleBrowseOutlines"
					>
						{{
							$i18n( 'articleguidance-specialnewarticle-browse-outlines-link' ).text()
						}}
					</cdx-button>
				</div>

				<!-- Skip guidance (experienced editors only) -->
				<div
					v-if="showSkipGuidance"
					class="ext-articleguidance-skip-guidance"
				>
					<a
						class="ext-articleguidance-skip-guidance-info"
						href="https://www.mediawiki.org/wiki/Article_guidance"
						target="_blank"
						rel="noopener"
						:aria-label="$i18n(
							'articleguidance-specialnewarticle-skip-guidance-info-label'
						).text()"
					>
						<cdx-icon
							class="ext-articleguidance-skip-guidance-icon"
							:icon="cdxIconInfo"
						></cdx-icon>
					</a>
					<span class="ext-articleguidance-skip-guidance-prefix">
						{{
							$i18n( 'articleguidance-specialnewarticle-skip-guidance-prefix' ).text()
						}}
					</span>
					<a
						class="ext-articleguidance-skip-guidance-link"
						:href="skipGuidanceUrl"
						@click="handleSkipGuidance"
					>{{
						$i18n( 'articleguidance-specialnewarticle-skip-guidance-link' ).text()
					}}</a>
				</div>
			</div>
		</template>
	</step>
</template>

<script>
const { defineComponent, ref, onMounted, computed, watch, nextTick } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxTextInput, CdxButton, CdxIcon, CdxProgressIndicator } = require( '../codex.js' );
const { cdxIconInfo } = require( '../icons.json' );
const { useSearch } = require( '../composables/useSearch.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { getEditArticleUrl } = require( '../utils/articleUrl.js' );
const instrument = require( '../logging/instrument.js' );
const { scrollToTop } = require( '../utils/scroll.js' );
const { isMobile } = require( '../utils/mobile.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const Outlines = require( './Outlines.vue' );
const StateMessage = require( './StateMessage.vue' );

module.exports = defineComponent( {
	name: 'SearchStep',
	components: {
		CdxTextInput,
		CdxButton,
		CdxIcon,
		CdxProgressIndicator,
		Step,
		ArticleCard,
		Outlines,
		StateMessage
	},
	setup() {
		const selectedLanguage = ref( mw.config.get( 'wgUserLanguage' ) );

		const store = useArticleGuidanceStore();
		const { searchQuery, showOutlines } = storeToRefs( store );

		const searchInput = ref( null );

		// Initialize search composable
		const {
			results, loading, error, performSearch, articleExist, checkExistence
		} = useSearch( searchQuery, selectedLanguage );

		onMounted( () => {
			store.loadOutlines();
			if ( searchQuery.value && searchQuery.value.trim().length >= 1 ) {
				performSearch( searchQuery.value );
				checkExistence();
			}
		} );

		watch( loading, ( isLoading ) => {
			if ( !isLoading && searchQuery.value ) {
				instrument.logWriteTitle( searchQuery.value, results.value.length );
			}
		} );

		// Dismiss outlines immediately when the user modifies the query
		watch( searchQuery, () => {
			if ( showOutlines.value ) {
				store.hideOutlines();
			}
		} );

		watch( showOutlines, ( visible ) => {
			if ( visible ) {
				if ( !isMobile() ) {
					nextTick( () => {
						if ( searchInput.value ) {
							searchInput.value.focus();
						}
					} );
				}
			} else {
				// Scroll after the results list has re-rendered (it is hidden
				// while outlines are shown via v-if), so the list lands at the top.
				nextTick( () => {
					scrollToTop();
				} );
			}
		} );

		// Handle result selection
		const handleSelect = ( result ) => {
			instrument.logSelectSuggestedTopic( result.id, {
				title: result.outlineName,
				qid: result.matchedQId
			} );
			store.selectArticle( result, articleExist.value === true );
		};

		// Handle browse outlines
		const handleBrowseOutlines = () => {
			store.browseOutlines();
		};

		// Handle going back from outlines
		const handleHideOutlines = () => {
			store.hideOutlines();
		};

		// Handle retrying after a search error
		const handleRetry = () => {
			performSearch( searchQuery.value );
			checkExistence();
		};

		// URL for the skip-guidance link; recomputed when the title changes
		const skipGuidanceUrl = computed( () => getEditArticleUrl( searchQuery.value ) );

		// Log the skip event; the link's href handles navigation
		const handleSkipGuidance = () => {
			instrument.logSkipGuidance( searchQuery.value );
		};

		// Only experienced editors are offered the skip-guidance bypass
		const isExperiencedEditor = computed( () => {
			const threshold = mw.config.get( 'wgArticleGuidanceJuniorEditorThreshold' );
			return ( mw.config.get( 'wgUserEditCount' ) || 0 ) >= threshold;
		} );

		// Show the skip-guidance strip once a title has been entered,
		// regardless of whether the search is still in progress
		const showSkipGuidance = computed(
			() => isExperiencedEditor.value &&
				!!searchQuery.value &&
				searchQuery.value.trim().length >= 1
		);

		const MAX_TOTAL = 8;
		const MAX_UNSUPPORTED = 3;

		const supportedResults = computed(
			() => results.value.filter( ( r ) => r.supported )
		);
		const unsupportedResults = computed(
			() => results.value.filter( ( r ) => !r.supported ).slice( 0, MAX_UNSUPPORTED )
		);
		const visibleResults = computed(
			() => supportedResults.value.concat( unsupportedResults.value ).slice( 0, MAX_TOTAL )
		);

		const hasFallbackLabels = computed(
			() => visibleResults.value.some( ( r ) => r.labelFallback )
		);

		// Computed properties for display states
		// Show Wikidata results even when a title already exists
		const showResults = computed(
			() => !loading.value && results.value.length > 0
		);

		// Only show "no results" if article doesn't exist
		const showNoResults = computed(
			() => !loading.value &&
				searchQuery.value &&
				results.value.length === 0 &&
				!error.value &&
				!articleExist.value
		);

		// Return everything you want to expose to the template
		return {
			searchInput,
			searchQuery,
			showOutlines,
			loading,
			error,
			visibleResults,
			hasFallbackLabels,
			handleSelect,
			handleBrowseOutlines,
			handleHideOutlines,
			handleRetry,
			handleSkipGuidance,
			skipGuidanceUrl,
			showResults,
			showNoResults,
			showSkipGuidance,
			cdxIconInfo
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-search-input {
	width: 100%;
	font-family: 'Linux Libertine', 'Georgia', 'Times', serif;

	.cdx-text-input {
		&__input {
			font-size: @font-size-x-large;
			line-height: @line-height-x-large;
			caret-color: @color-progressive;

			&, &:focus, &:hover {
				outline: 0;
				box-shadow: none;
				border-top: 0;
				border-left: 0;
				border-right: 0;
				border-bottom: 1px solid @border-color-base;
			}

			&:focus, &:focus-visible {
				border-bottom: 2px solid @color-progressive;
			}

			&::placeholder {
				color: @color-subtle;
				opacity: 0.5;
			}
		}
	}
}

.ext-articleguidance-results {
	margin-top: 16px;
}

.ext-articleguidance-inline-error {
	display: inline-flex;
	align-items: baseline;
	gap: @spacing-25;
	margin-bottom: @spacing-50;
}

.ext-articleguidance-inline-error-message {
	color: @color-subtle;
	font-size: @font-size-medium;
	font-weight: @font-weight-normal;
}

.ext-articleguidance-inline-error-retry {
	padding: 0;
	min-height: auto;
	font-weight: @font-weight-normal;
}

.ext-articleguidance-results-list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 12px;
}

.ext-articleguidance-results-heading {
	margin: 0 0 8px 0;
	font-weight: @font-weight-bold;
	font-size: @font-size-x-large;
}

.ext-articleguidance-search-footer {
	margin-top: 24px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.ext-articleguidance-browse {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.ext-articleguidance-browse-prefix {
	color: @color-base;
}

.ext-articleguidance-browse-link.cdx-button {
	color: @color-progressive;
	padding: 0;
	min-height: auto;
	font-size: inherit;
}

// Mobile: subtle full-bleed strip flush with the bottom of the panel so it
// reads as connected to the MediaWiki page footer. The negative margins break
// out of the step body's padding (see Step.vue).
.ext-articleguidance-skip-guidance {
	display: flex;
	align-items: center;
	gap: 4px;
	margin: 0 calc( -1 * clamp( 16px, 3vw, 32px ) ) calc( -1 * clamp( 16px, 3vw, 32px ) );
	padding: 12px clamp( 16px, 3vw, 32px );
	background-color: @background-color-neutral-subtle;
	border-top: 1px solid @border-color-subtle;
	font-size: @font-size-small;
}

.ext-articleguidance-skip-guidance-info {
	display: inline-flex;
	color: @color-subtle;
	text-decoration: none;

	&:hover,
	&:focus {
		color: @color-base;
	}
}

.ext-articleguidance-skip-guidance-icon {
	color: inherit;
}

.ext-articleguidance-skip-guidance-prefix {
	color: @color-base;
}

.ext-articleguidance-skip-guidance-link {
	.cdx-mixin-link();
}

@media only screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-results-list {
			grid-template-columns: 1fr;
		}

		// Desktop: browse and skip share a row, with skip aligned to the right.
		.ext-articleguidance-search-footer {
			flex-direction: row;
			align-items: center;
		}

		.ext-articleguidance-skip-guidance {
			margin: 0 0 0 auto;
			padding: 0;
			background-color: transparent;
			border-top: 0;
		}
	}
}
</style>
