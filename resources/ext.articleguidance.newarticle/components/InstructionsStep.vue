<template>
	<step
		step-name="instructions"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<!-- Guidance -->
		<h4 class="ext-articleguidance-guidance-heading">
			{{ $i18n( 'articleguidance-instructions-guidance-heading' ).text() }}
		</h4>
		<div class="ext-articleguidance-guidance-intro">
			{{ $i18n( 'articleguidance-instructions-guidance-intro' ).text() }}
		</div>

		<!-- Community-provided tips (from outline) -->
		<div
			v-if="selectedOutline && selectedOutline.instructions"
			ref="tipsContainer"
			class="ext-articleguidance-guidance-tips"
		>
			<!-- eslint-disable-next-line vue/no-v-html -->
			<div class="content" v-html="selectedOutline.instructions"></div>
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
const { defineComponent, onMounted, ref, watch, nextTick } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxButton } = require( '../codex.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const instrument = require( '../logging/instrument.js' );
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
		const { selectedOutline } = storeToRefs( store );

		// Container holding the community-authored guidance HTML.
		const tipsContainer = ref( null );

		// Community-authored links should open in a new tab so the user keeps
		// their place in the flow.
		const openLinksInNewTab = () => {
			const el = tipsContainer.value;
			if ( !el ) {
				return;
			}
			Array.prototype.forEach.call( el.querySelectorAll( 'a' ), ( link ) => {
				link.setAttribute( 'target', '_blank' );
				link.setAttribute( 'rel', 'noopener noreferrer' );
			} );
		};

		onMounted( () => {
			instrument.logGuidanceShown();
			nextTick( openLinksInNewTab );
		} );

		// Guidance may arrive after the step mounts; re-process links when it does.
		watch(
			() => selectedOutline.value && selectedOutline.value.instructions,
			() => {
				nextTick( openLinksInNewTab );
			}
		);

		// Navigate to article creation page
		const handleStartWriting = () => {
			store.startWriting();
		};

		// Handle back navigation
		const handleBack = () => {
			store.goBack();
		};

		return {
			selectedOutline,
			tipsContainer,
			handleStartWriting,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-guidance-heading {
	font-size: @font-size-large;
	font-weight: @font-weight-bold;
	color: @color-emphasized;
	margin: 0 0 4px 0;
	border: 0;
}

.ext-articleguidance-guidance-intro {
	color: @color-subtle;
	font-size: @font-size-small;
	margin: 0 0 12px 0;
}

.ext-articleguidance-guidance-tips {
	color: @color-base;
	margin-bottom: 12px;

	.content {
		// Override left padding inherited from the skin so the prose lines up
		// with the heading and intro above it.
		padding-left: 0;
		margin-left: 0;
	}

	.content > :first-child {
		margin-top: 0;
	}
}

.ext-articleguidance-instructions-actions {
	position: sticky;
	bottom: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	margin-top: 32px;
	padding: 16px 0;
	gap: 8px;
	background-color: @background-color-base;

	.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}
</style>
