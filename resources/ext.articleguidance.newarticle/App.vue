<template>
	<div class="ext-articleguidance-newarticle">
		<search-step v-if="currentStep === 'search'"></search-step>
		<sources-step v-else-if="currentStep === 'sources'"></sources-step>
		<notability-step v-else-if="currentStep === 'notability'"></notability-step>
		<instructions-step v-else-if="currentStep === 'instructions'"></instructions-step>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const useArticleGuidanceStore = require( './stores/useArticleGuidanceStore.js' );
const SearchStep = require( './components/SearchStep.vue' );
const SourcesStep = require( './components/SourcesStep.vue' );
const InstructionsStep = require( './components/InstructionsStep.vue' );
const NotabilityStep = require( './components/NotabilityStep.vue' );

module.exports = defineComponent( {
	name: 'App',
	components: {
		SearchStep,
		SourcesStep,
		NotabilityStep,
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
