<template>
	<step
		step-name="search"
		:title="$i18n( 'articleguidance-specialnewarticle-search-title' ).text()"
	>
		<div class="ext-articleguidance-search-controls">
			<cdx-text-input
				v-model="searchQuery"
				:placeholder="$i18n( 'articleguidance-specialnewarticle-title-placeholder' ).text()"
				class="ext-articleguidance-search-input"
			>
			</cdx-text-input>
		</div>

		<div class="ext-articleguidance-results">
			<!-- Loading state -->
			<div v-if="loading">
				<cdx-progress-indicator show-label>
					{{ $i18n( 'articleguidance-specialnewarticle-checking' ).text() }}
				</cdx-progress-indicator>
			</div>

			<!-- Error state -->
			<cdx-message
				v-if="error"
				type="error"
				class="ext-articleguidance-error">
				{{ error }}
			</cdx-message>

			<!-- Article exists warning -->
			<div v-if="showExistsWarning" class="ext-articleguidance-exists-container">
				<cdx-message
					type="warning"
					class="ext-articleguidance-exists-warning"
				>
					{{
						$i18n(
							'articleguidance-specialnewarticle-exists-warning',
							searchQuery
						).text()
					}}
				</cdx-message>
				<cdx-button
					action="progressive"
					@click="handleEditExisting"
				>
					{{ $i18n( 'articleguidance-specialnewarticle-edit-existing' ).text() }}
				</cdx-button>
			</div>

			<!-- Results list (only shown if article doesn't exist) -->
			<template v-if="showResults">
				<p class="ext-articleguidance-results-heading">
					{{ $i18n( 'articleguidance-specialnewarticle-disambiguation-title' ).text() }}
				</p>
				<div class="ext-articleguidance-results-list">
					<article-card
						v-for="result in maxResultsWithOutlines"
						:key="result.id"
						:title="result.label"
						:description="result.description"
						:thumbnail="result.thumbnail"
						:outline-name="result.outlineName"
						@click="handleSelect( result )"
					>
					</article-card>
				</div>
			</template>

			<!-- No results -->
			<state-message v-if="showNoResults">
				{{ $i18n( 'articleguidance-specialnewarticle-no-results', searchQuery ).text() }}
			</state-message>
		</div>

		<!-- Can't find option -->
		<div v-if="showResults || showNoResults" class="ext-articleguidance-search-footer">
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
	</step>
</template>

<script>
const { defineComponent, ref, onMounted, computed } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxTextInput, CdxMessage, CdxButton, CdxProgressIndicator } = require( '../codex.js' );
const { useSearch } = require( '../composables/useSearch.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const StateMessage = require( './StateMessage.vue' );

module.exports = defineComponent( {
	name: 'SearchStep',
	components: {
		CdxTextInput,
		CdxMessage,
		CdxButton,
		CdxProgressIndicator,
		Step,
		ArticleCard,
		StateMessage
	},
	setup() {
		const selectedLanguage = ref( mw.config.get( 'wgUserLanguage' ) );

		const store = useArticleGuidanceStore();
		const { outlinesList, searchQuery } = storeToRefs( store );

		// Initialize search composable
		const {
			results, loading, error, performSearch, articleExist
		} = useSearch( searchQuery, selectedLanguage );

		onMounted( () => {
			store.loadOutlines();
			if ( searchQuery.value && searchQuery.value.trim().length >= 1 ) {
				performSearch( searchQuery.value );
			}
		} );

		// Handle result selection
		const handleSelect = ( result ) => {
			store.selectArticle( result );
		};

		// Handle browse outlines
		const handleBrowseOutlines = () => {
			store.browseOutlines();
		};

		// Handle editing existing article
		const handleEditExisting = () => {
			const editUrl = mw.util.getUrl( searchQuery.value, { action: 'edit' } );
			window.location.href = editUrl;
		};

		// Computed property to group results and concatenate all matching outline names
		// Since a single Wikidata item can match multiple outlines, we group by ID
		// and display all matching outline names separated by commas
		const resultsWithOutlines = computed( () => {
			// Create a map from articleType Q ID to outline label
			const outlineMap = {};
			outlinesList.value.forEach( ( outline ) => {
				if ( outline.articleType ) {
					outlineMap[ outline.articleType ] = outline.label;
				}
			} );

			// Group results by Wikidata ID and collect all outline names and QIds
			const groupedResults = {};
			results.value.forEach( ( result ) => {
				if ( !groupedResults[ result.id ] ) {
					groupedResults[ result.id ] = {
						id: result.id,
						label: result.label,
						description: result.description,
						url: result.url,
						matchedQId: result.matchedQId,
						hierarchyDepth: result.hierarchyDepth,
						thumbnail: result.thumbnail,
						outlineNames: [],
						matchedQIds: []
					};
				}
				// Add outline name if it exists and isn't already in the list
				if ( result.matchedQId ) {
					if ( !groupedResults[ result.id ].matchedQIds.includes( result.matchedQId ) ) {
						groupedResults[ result.id ].matchedQIds.push( result.matchedQId );
					}
					if ( outlineMap[ result.matchedQId ] ) {
						const outlineName = outlineMap[ result.matchedQId ];
						if ( !groupedResults[ result.id ].outlineNames.includes( outlineName ) ) {
							groupedResults[ result.id ].outlineNames.push( outlineName );
						}
					}
				}
			} );

			// Convert grouped results to array and concatenate outline names
			return Object.values( groupedResults ).map( ( result ) => ( {
				id: result.id,
				label: result.label,
				description: result.description,
				url: result.url,
				matchedQId: result.matchedQId,
				hierarchyDepth: result.hierarchyDepth,
				thumbnail: result.thumbnail,
				outlineNames: result.outlineNames,
				matchedQIds: result.matchedQIds,
				outlineName: result.outlineNames.length > 0 ? result.outlineNames.join( ', ' ) : null
			} ) );
		} );

		const maxResultsWithOutlines = computed( () => resultsWithOutlines.value.slice( 0, 5 ) );

		// Computed properties for display states
		// Show warning when article exists
		const showExistsWarning = computed(
			() => articleExist.value === true && searchQuery.value.trim().length > 0
		);

		// Hide Wikidata results when article exists
		const showResults = computed(
			() => !loading.value && results.value.length > 0 && !articleExist.value
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
			loading,
			error,
			maxResultsWithOutlines,
			handleSelect,
			handleBrowseOutlines,
			handleEditExisting,
			showExistsWarning,
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

.ext-articleguidance-error {
	margin-bottom: 16px;
}

.ext-articleguidance-exists-container {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-bottom: 16px;
}

.ext-articleguidance-exists-warning {
	margin: 0;
}

.ext-articleguidance-results-list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 12px;
}

.ext-articleguidance-results-heading {
	margin: 0 0 8px 0;
	font-weight: @font-weight-bold;
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
