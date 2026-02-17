<template>
	<div class="ext-articleguidance-newarticle">
		<!-- Step components -->
		<search-step
			v-if="currentStep === 'search'"
			:initial-title="initialTitle"
			@select="handleSelect"
			@browse-outlines="handleBrowseOutlines"
		>
		</search-step>
		<outlines-step
			v-else-if="currentStep === 'outlines'"
			:article-title="searchQuery"
			@select-outline="handleOutlineSelect"
			@back="back"
		>
		</outlines-step>
		<sources-step
			v-else-if="currentStep === 'sources'"
			:outline="selectedOutline"
			:article-title="searchQuery"
			@continue="handleSourcesContinue"
			@back="back"
		>
		</sources-step>
		<instructions-step
			v-else-if="currentStep === 'instructions'"
			:outline="selectedOutline"
			:article-title="searchQuery"
			:references="references"
			@back="back"
		>
		</instructions-step>
	</div>
</template>

<script>
const { defineComponent, ref } = require( 'vue' );
const { useSteps } = require( './composables/useSteps.js' );
const { useOutlines } = require( './composables/useOutlines.js' );
const SearchStep = require( './components/SearchStep.vue' );
const OutlinesStep = require( './components/OutlinesStep.vue' );
const SourcesStep = require( './components/SourcesStep.vue' );
const InstructionsStep = require( './components/InstructionsStep.vue' );

module.exports = defineComponent( {
	name: 'App',
	components: {
		SearchStep,
		OutlinesStep,
		SourcesStep,
		InstructionsStep
	},
	props: {
		initialTitle: {
			type: String,
			default: ''
		}
	},
	setup() {
		// Step navigation
		const { currentStep, goToOutlines, goToSources, goToInstructions, back } = useSteps();

		// Outlines composable
		const { getOutlines } = useOutlines();

		// Shared state between steps
		const selectedResult = ref( null );
		const selectedOutline = ref( null );
		const searchQuery = ref( '' );
		const references = ref( [] );

		// Handle result selection from SearchStep
		const handleSelect = async ( data ) => {
			selectedResult.value = data.result;
			// Use the result's label as the article title
			searchQuery.value = data.result.label;

			// Fetch outlines and find the matching one
			try {
				const outlines = await getOutlines();
				const matchedOutline = outlines.find(
					( o ) => o.articleType === data.result.matchedQId
				);

				if ( matchedOutline ) {
					selectedOutline.value = matchedOutline;
					goToSources();
				} else {
					// If no outline found, show error or go to browse
					// For now, go to browse mode
					goToOutlines();
				}
			} catch ( err ) {
				// On error, go to browse mode
				goToOutlines();
			}
		};

		// Handle browse outlines (no selected result)
		const handleBrowseOutlines = ( query ) => {
			selectedResult.value = null;
			// Preserve the search query if provided
			if ( query !== undefined ) {
				searchQuery.value = query;
			}
			goToOutlines();
		};

		// Handle outline selection from OutlinesStep (when browsing all outlines)
		const handleOutlineSelect = ( outline ) => {
			selectedOutline.value = outline;
			selectedResult.value = {
				label: outline.label,
				description: outline.description,
				matchedQId: outline.articleType
			};
			// Only use the outline label as article title if there's no existing title
			if ( !searchQuery.value ) {
				searchQuery.value = outline.label;
			}
			goToSources();
		};

		// Handle sources step continue
		const handleSourcesContinue = ( refs ) => {
			references.value = refs;
			goToInstructions();
		};

		return {
			// Step state
			currentStep,
			back,
			// Shared state
			selectedOutline,
			searchQuery,
			references,
			// Event handlers
			handleSelect,
			handleBrowseOutlines,
			handleOutlineSelect,
			handleSourcesContinue
		};
	}
} );
</script>

<style lang="less">
.ext-articleguidance-newarticle {
	max-width: 1200px;
	margin: 0 auto;
}
</style>
