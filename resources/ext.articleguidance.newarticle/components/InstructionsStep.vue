<template>
	<step
		step-name="instructions"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<!-- Guidance card -->
		<div class="ext-articleguidance-guidance-card">
			<h4 class="ext-articleguidance-guidance-heading">
				{{ $i18n( 'articleguidance-instructions-guidance-heading' ).text() }}
			</h4>
			<div class="ext-articleguidance-guidance-intro">
				{{ $i18n( 'articleguidance-instructions-guidance-intro' ).text() }}
			</div>

			<!-- Community-provided tips (from outline) -->
			<div
				v-if="selectedOutline && selectedOutline.instructions"
				class="ext-articleguidance-guidance-tips"
			>
				<!-- eslint-disable-next-line vue/no-v-html -->
				<div v-html="selectedOutline.instructions"></div>
			</div>

			<!-- Source guidance -->
			<div class="ext-articleguidance-guidance-sources">
				{{ $i18n( 'articleguidance-instructions-source-guidance' ).text() }}
			</div>
		</div>

		<!-- Actions -->
		<div class="ext-articleguidance-instructions-actions">
			<cdx-button
				weight="primary"
				action="progressive"
				@click="handleStartWriting"
			>
				{{ $i18n( 'articleguidance-instructions-start-writing' ).text() }}
			</cdx-button>
		</div>
	</step>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxButton } = require( '../codex.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { getCreateArticleUrl } = require( '../utils/articleUrl.js' );
const ArticleInfo = require( './ArticleInfo.vue' );
const Step = require( './Step.vue' );

module.exports = defineComponent( {
	name: 'InstructionsStep',
	components: {
		ArticleInfo,
		CdxButton,
		Step
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, references, creationTitle } = storeToRefs( store );

		const buildCreateArticleUrl = () => getCreateArticleUrl(
			creationTitle.value,
			selectedOutline.value.title,
			references.value.map( ( r ) => r.url )
		);

		// Navigate to article creation page
		const handleStartWriting = () => {
			window.location.href = buildCreateArticleUrl();
		};

		// Handle back navigation
		const handleBack = () => {
			store.goBack();
		};

		return {
			selectedOutline,
			handleStartWriting,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-guidance-card {
	background-color: @background-color-neutral-subtle;
	border-radius: @border-radius-base;
	padding: 16px;

	.ext-articleguidance-guidance-intro {
		color: @color-subtle;
		font-size: @font-size-small;
		margin: 0 0 12px 0;
	}

	.ext-articleguidance-guidance-sources {
		color: @color-subtle;
		font-size: @font-size-small;
		margin: 0;
		padding-top: 12px;
		border-top: @border-width-base @border-style-base @border-color-subtle;
	}
}

.ext-articleguidance-guidance-heading {
	font-size: @font-size-large;
	font-weight: @font-weight-bold;
	color: @color-emphasized;
	margin: 0 0 4px 0;
	border: 0;
}

.ext-articleguidance-guidance-tips {
	color: @color-base;
	margin-bottom: 12px;
	padding-top: 12px;
}

.ext-articleguidance-instructions-actions {
	display: flex;
	flex-direction: column;
	align-items: center;
	margin-top: 32px;
	padding-top: 24px;
	gap: 8px;

	.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}
</style>
