<template>
	<step
		step-name="unsupportedsubject"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-card
			v-if="selectedResult"
			class="ext-articleguidance-unsupported-subject-card"
			:title="selectedResult.label"
			:description="selectedResult.description"
			:thumbnail="selectedResult.thumbnail"
		></article-card>

		<h3 class="ext-articleguidance-unsupported-subject-heading">
			{{ $i18n( 'articleguidance-unsupported-subject-heading' ).text() }}
		</h3>

		<div class="ext-articleguidance-unsupported-subject-options">
			<action-option
				:icon="cdxIconUserTalk"
				:title="requestTitle"
				:description="requestDescription"
				:url="requestSupportUrl"
				:log="logRequestSupport"
			></action-option>
			<action-option
				:icon="cdxIconArticle"
				:title="startTitle"
				:description="startDescription"
				:url="startWritingUrl"
				:log="logStartWriting"
			></action-option>
		</div>
	</step>
</template>

<script>
const { defineComponent, computed, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { cdxIconUserTalk, cdxIconArticle } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const instrument = require( '../logging/instrument.js' );
const { getRequestSupportUrl } = require( '../utils/projectFeedback.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const ActionOption = require( './ActionOption.vue' );

module.exports = defineComponent( {
	name: 'UnsupportedSubjectStep',
	components: {
		Step,
		ArticleCard,
		ActionOption
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedResult, searchQuery, articleTitle } = storeToRefs( store );

		const requestSupportUrl = computed(
			() => getRequestSupportUrl( selectedResult.value )
		);

		const startWritingUrl = computed(
			() => mw.util.getUrl( articleTitle.value || searchQuery.value, { veaction: 'edit' } )
		);

		const requestTitle = computed(
			() => mw.message( 'articleguidance-unsupported-subject-request-title' ).text()
		);
		const requestDescription = computed(
			() => mw.message( 'articleguidance-unsupported-subject-request-description' ).text()
		);
		const startTitle = computed(
			() => mw.message( 'articleguidance-unsupported-subject-start-title' ).text()
		);
		const startDescription = computed(
			() => mw.message( 'articleguidance-unsupported-subject-start-description' ).text()
		);

		onMounted( () => {
			instrument.logUnsupportedSubjectShown();
		} );

		const handleBack = () => {
			store.goBack();
		};

		return {
			selectedResult,
			requestSupportUrl,
			startWritingUrl,
			requestTitle,
			requestDescription,
			startTitle,
			startDescription,
			cdxIconUserTalk,
			cdxIconArticle,
			handleBack,
			logRequestSupport: () => instrument.logUnsupportedSubjectAction( 'request_support' ),
			logStartWriting: () => instrument.logUnsupportedSubjectAction( 'start_writing' )
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-unsupported-subject-card {
	margin-bottom: 24px;
}

.ext-articleguidance-unsupported-subject-heading {
	font-size: @font-size-medium;
	font-weight: @font-weight-bold;
	margin: 0 0 12px 0;
}

.ext-articleguidance-unsupported-subject-options {
	display: flex;
	flex-direction: column;
}
</style>
