<template>
	<step
		step-name="subjectcovered"
		:title="$i18n( 'articleguidance-subjectcovered-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-card
			:thumbnail="localArticleInfo.thumbnail"
			:title="localArticleInfo.title"
			:description="localArticleInfo.description"
			@click="handleReadArticle"
		>
		</article-card>
		<div class="ext-articleguidance-subjectcovered-message">
			{{ $i18n( 'articleguidance-subjectcovered-description' ).text() }}
		</div>
		<cdx-button
			weight="primary"
			action="progressive"
			class="ext-articleguidance-subjectcovered-button"
			@click="handleImproveArticle"
		>
			{{ $i18n( 'articleguidance-subjectcovered-button' ).text() }}
		</cdx-button>
	</step>
</template>

<script>
const { defineComponent, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxButton } = require( '../codex.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { getEditArticleUrl } = require( '../utils/articleUrl.js' );
const instrument = require( '../logging/instrument.js' );

module.exports = defineComponent( {
	name: 'SubjectCoveredStep',
	components: {
		Step,
		CdxButton,
		ArticleCard
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { localArticleInfo } = storeToRefs( store );

		onMounted( () => {
			instrument.logSubjectCoveredShown();
		} );

		const handleBack = () => {
			store.goBack();
		};
		const handleImproveArticle = () => {
			instrument.logSubjectCoveredAction( 'improve' );
			location.href = getEditArticleUrl(
				localArticleInfo.value.title
			);
		};
		const handleReadArticle = () => {
			instrument.logSubjectCoveredAction( 'read' );
			open( mw.util.getUrl( localArticleInfo.value.title ), '_blank' );
		};
		return {
			localArticleInfo,
			handleBack,
			handleImproveArticle,
			handleReadArticle
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-subjectcovered-message {
	margin: 1rem 0 0.5rem 0;
	color: @color-subtle;
	font-size: @font-size-medium;
}
.ext-articleguidance-subjectcovered-button {
	margin-top: 0.5rem;

	&.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}
</style>
