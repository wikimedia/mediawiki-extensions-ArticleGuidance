<template>
	<div class="ext-articleguidance-newarticle">
		<search-step v-if="currentStep === 'search'"></search-step>
		<subject-covered-step v-else-if="currentStep === 'subjectcovered'"></subject-covered-step>
		<title-conflict-step v-else-if="currentStep === 'titleconflict'"></title-conflict-step>
		<sources-step v-else-if="currentStep === 'sources'"></sources-step>
		<notability-step v-else-if="currentStep === 'notability'"></notability-step>
		<unsupported-subject-step
			v-else-if="currentStep === 'unsupportedsubject'"
		></unsupported-subject-step>
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
const UnsupportedSubjectStep = require( './components/UnsupportedSubjectStep.vue' );
const SubjectCoveredStep = require( './components/SubjectCoveredStep.vue' );
const TitleConflictStep = require( './components/TitleConflictStep.vue' );
const { scrollToTop } = require( './utils/scroll.js' );

module.exports = defineComponent( {
	name: 'App',
	components: {
		SearchStep,
		SubjectCoveredStep,
		TitleConflictStep,
		SourcesStep,
		NotabilityStep,
		UnsupportedSubjectStep,
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

		watch( currentStep, () => {
			scrollToTop();
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
