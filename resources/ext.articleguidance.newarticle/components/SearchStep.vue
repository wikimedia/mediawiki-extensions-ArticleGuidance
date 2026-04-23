<template>
	<step
		step-name="search"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="showOutlines"
		@back="handleHideOutlines"
	>
		<div class="ext-articleguidance-search-controls">
			<cdx-text-input
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

			<!-- Can't find option -->
			<div
				v-if="showResults || showNoResults || error"
				class="ext-articleguidance-search-footer"
			>
				<span class="ext-articleguidance-browse-prefix">
					{{ $i18n( 'articleguidance-specialnewarticle-browse-outlines-prefix' ).text() }}
				</span>
				<cdx-button
					class="ext-articleguidance-browse-link"
					weight="quiet"
					action="progressive"
					@click="handleBrowseOutlines"
				>
					{{ $i18n( 'articleguidance-specialnewarticle-browse-outlines-link' ).text() }}
				</cdx-button>
			</div>
		</template>
	</step>
</template>

<script>
const { defineComponent, ref, onMounted, computed, watch } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxTextInput, CdxButton, CdxProgressIndicator } = require( '../codex.js' );
const { useSearch } = require( '../composables/useSearch.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const instrument = require( '../logging/instrument.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const Outlines = require( './Outlines.vue' );
const StateMessage = require( './StateMessage.vue' );

const MAX_RESULTS = 5;

module.exports = defineComponent( {
	name: 'SearchStep',
	components: {
		CdxTextInput,
		CdxButton,
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

		const MAX_SUPPORTED = MAX_RESULTS;
		const MAX_UNSUPPORTED = 3;

		const supportedResults = computed(
			() => results.value.filter( ( r ) => r.supported ).slice( 0, MAX_SUPPORTED )
		);
		const unsupportedResults = computed(
			() => results.value.filter( ( r ) => !r.supported ).slice( 0, MAX_UNSUPPORTED )
		);
		const visibleResults = computed(
			() => supportedResults.value.concat( unsupportedResults.value )
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
			searchQuery,
			showOutlines,
			loading,
			error,
			visibleResults,
			handleSelect,
			handleBrowseOutlines,
			handleHideOutlines,
			handleRetry,
			showResults,
			showNoResults
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

@media only screen and ( min-width: @min-width-breakpoint-desktop ) {
	.ext-articleguidance-results-list {
		grid-template-columns: 1fr;
	}
}

.ext-articleguidance-results-heading {
	margin: 0 0 8px 0;
	font-weight: @font-weight-bold;
	font-size: @font-size-x-large;
}

.ext-articleguidance-search-footer {
	margin-top: 24px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.ext-articleguidance-browse-prefix {
	color: @color-base;
}

.ext-articleguidance-browse-link {
	color: @color-progressive;
	padding: 0;
	min-height: auto;
}
</style>
