<template>
	<div class="ext-articleguidance-newarticle">
		<search-step v-if="currentStep === 'search'"></search-step>
		<subject-covered-step v-else-if="currentStep === 'subjectcovered'"></subject-covered-step>
		<title-conflict-step v-else-if="currentStep === 'titleconflict'"></title-conflict-step>
		<update-title-step v-else-if="currentStep === 'updatetitle'"></update-title-step>
		<sources-step v-else-if="currentStep === 'sources'"></sources-step>
		<notability-step v-else-if="currentStep === 'notability'"></notability-step>
		<instructions-step v-else-if="currentStep === 'instructions'"></instructions-step>
	</div>
</template>

<script>
const { defineComponent, watch } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const useArticleGuidanceStore = require( './stores/useArticleGuidanceStore.js' );
const SearchStep = require( './components/SearchStep.vue' );
const SourcesStep = require( './components/SourcesStep.vue' );
const InstructionsStep = require( './components/InstructionsStep.vue' );
const NotabilityStep = require( './components/NotabilityStep.vue' );
const SubjectCoveredStep = require( './components/SubjectCoveredStep.vue' );
const TitleConflictStep = require( './components/TitleConflictStep.vue' );
const UpdateTitleStep = require( './components/UpdateTitleStep.vue' );
const { scrollToTop } = require( './utils/scroll.js' );
const instrument = require( './logging/instrument.js' );

module.exports = defineComponent( {
	name: 'App',
	components: {
		SearchStep,
		SubjectCoveredStep,
		TitleConflictStep,
		UpdateTitleStep,
		SourcesStep,
		NotabilityStep,
		InstructionsStep
	},
	props: {
		initialTitle: {
			type: String,
			default: ''
		},
		source: {
			type: String,
			default: ''
		},
		returnTo: {
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

		if ( props.source === 'redlink' && props.initialTitle ) {
			store.setRedLinkOrigin( props.initialTitle, props.returnTo );
		}

		let stepStartTime = performance.now();

		watch( currentStep, () => {
			stepStartTime = performance.now();
			scrollToTop();
		} );

		// The last 'hidden' event shows where the user left the workflow
		document.addEventListener( 'visibilitychange', () => {
			instrument.logVisibilityChange(
				document.hidden,
				currentStep.value,
				Math.round( performance.now() - stepStartTime )
			);
		} );

		return { currentStep };
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-newarticle {
	width: 100%;
	max-width: 64rem;
	margin: 0 auto;
}
</style>
