<template>
	<div v-if="showPanel">
		<!-- Backdrop -->
		<div
			class="ext-articleguidance-publish-followup__backdrop"
			@click="showPanel = false"
		></div>
		<!-- Panel -->
		<div class="ext-articleguidance-publish-followup">
			<div class="ext-articleguidance-publish-followup__row--confirmation">
				<cdx-icon
					:icon="cdxIconSuccess"
					class="ext-articleguidance-publish-followup__icon
						ext-articleguidance-publish-followup__icon--success"
				></cdx-icon>
				<span class="ext-articleguidance-publish-followup__heading">
					{{ $i18n( 'articleguidance-publish-followup-confirmation-title' ).text() }}
				</span>
				<cdx-button
					weight="quiet"
					class="ext-articleguidance-publish-followup__close"
					:aria-label="$i18n( 'articleguidance-publish-followup-close-button' ).text()"
					@click="showPanel = false"
				>
					<cdx-icon :icon="cdxIconClose"></cdx-icon>
				</cdx-button>
			</div>
			<div class="ext-articleguidance-publish-followup__row">
				<span class="ext-articleguidance-publish-followup__content-message">
					{{ $i18n( 'articleguidance-publish-followup-community-review' ).text() }}
				</span>
			</div>
			<div class="ext-articleguidance-publish-followup__row--button">
				<cdx-button
					weight="primary"
					action="progressive"
					class="ext-articleguidance-publish-followup__edit-more"
					@click="handleImproveArticle"
				>
					{{ $i18n( 'articleguidance-publish-followup-edit-more-button' ).text() }}
				</cdx-button>
			</div>
		</div>
	</div>
</template>

<script>
const { defineComponent, ref } = require( 'vue' );
const { CdxButton, CdxIcon } = require( './codex.js' );
const icons = require( './icons.json' );

// @vue/component
module.exports = exports = defineComponent( {
	name: 'PublishFollowUp',
	components: { CdxButton, CdxIcon },
	setup() {
		const showPanel = ref( true );
		const handleImproveArticle = () => {
			location.href = mw.util.getUrl( mw.config.get( 'wgPageName' ), { action: 'edit' } );
		};
		return {
			showPanel,
			handleImproveArticle,
			cdxIconSuccess: icons.cdxIconSuccess,
			cdxIconClose: icons.cdxIconClose
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-publish-followup {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 100;
	background-color: #fff;
	border-top: 1px solid #a2a9b1;
	border-top-left-radius: 10px;
	border-top-right-radius: 10px;
	padding: 12px 16px;
	display: flex;
	flex-direction: column;
	gap: 8px;

	&__backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.5);
		z-index: 99;
	}

	&__row,
	&__row--confirmation,
	&__row--button {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	&__row--confirmation {
		font-weight: bold;
	}

	&__row--button {
		justify-content: center;
	}

	&__heading {
		flex: 1;
		font-size: @font-size-large;
	}

	&__content-message {
		padding-left: 28px; // 20px for the success icon + 8px gap
		color: @color-subtle;
		font-size: @font-size-medium;
	}

	&__content-message:dir(rtl) {
		padding-left: 0;
		padding-right: 28px;
	}

	&__edit-more {
		&.cdx-button {
			width: 100%;
			margin-top: 8px;
			margin-bottom: 8px;
		}
	}

	&__icon--success {
		color: #00af89;
	}
}
</style>
