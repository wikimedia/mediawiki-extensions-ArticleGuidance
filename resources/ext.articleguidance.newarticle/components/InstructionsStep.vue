<template>
	<step
		step-name="instructions"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<!-- Heading sits above the card on desktop; on mobile the card is a
		transparent passthrough so the layout is unchanged. -->
		<h4 class="ext-articleguidance-guidance-heading">
			{{ $i18n( 'articleguidance-instructions-guidance-heading' ).text() }}
		</h4>

		<!-- Guidance: contained reading column (carded on desktop) -->
		<div class="ext-articleguidance-guidance-card">
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
		</div>

		<!-- Actions -->
		<div class="ext-articleguidance-instructions-actions">
			<cdx-button
				class="ext-articleguidance-instructions-back-btn"
				weight="quiet"
				@click="handleBack"
			>
				{{ $i18n( 'articleguidance-navigation-back' ).text() }}
			</cdx-button>
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

// On mobile the guidance card is a transparent passthrough; the card's visual
// treatment (background, border, padding) is applied on desktop only so the
// mobile layout is unchanged.

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

.ext-articleguidance-instructions-actions > .ext-articleguidance-instructions-back-btn {
	display: none;
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-guidance-card {
			background-color: @background-color-neutral-subtle;
			border: @border-width-base @border-style-base @border-color-subtle;
			border-radius: @border-radius-base;
			padding: 24px;
		}

		// The intro line is only shown on mobile.
		.ext-articleguidance-guidance-intro {
			display: none;
		}

		.ext-articleguidance-instructions-actions {
			flex-direction: row;
			justify-content: flex-end;
			align-items: center;

			.cdx-button {
				width: auto;
				max-width: none;
			}
		}

		.ext-articleguidance-instructions-back-btn {
			display: inline-flex;
		}
	}
}
</style>
