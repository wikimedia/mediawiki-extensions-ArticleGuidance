<template>
	<div class="ext-articleguidance-newarticle">
		<search-step v-if="currentStep === 'search'"></search-step>
		<outlines-step v-else-if="currentStep === 'outlines'"></outlines-step>
		<sources-step v-else-if="currentStep === 'sources'"></sources-step>
		<instructions-step v-else-if="currentStep === 'instructions'"></instructions-step>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const useArticleGuidanceStore = require( './stores/useArticleGuidanceStore.js' );
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
	setup( props ) {
		const store = useArticleGuidanceStore();
		const { currentStep } = storeToRefs( store );

		if ( props.initialTitle ) {
			store.setSearchQuery( props.initialTitle );
		}

		return { currentStep };
	}
} );
</script>

<style lang="less">
.ext-articleguidance-newarticle {
	max-width: 1200px;
	margin: 0 auto;
}
</style>
