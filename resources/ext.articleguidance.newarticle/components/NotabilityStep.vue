<template>
	<step
		step-name="notability"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<cdx-message type="warning" class="ext-articleguidance-notability-warning">
			{{ warningMessage }}
		</cdx-message>

		<div class="ext-articleguidance-notability-options">
			<h3 class="ext-articleguidance-notability-options-heading">
				{{ $i18n( 'articleguidance-notability-options-heading' ).text() }}
			</h3>
			<div class="ext-articleguidance-notability-options-list">
				<div
					v-for="option in contributionOptions"
					:key="option.key"
					class="ext-articleguidance-notability-option"
				>
					<cdx-icon
						:icon="option.icon"
						class="ext-articleguidance-notability-option-icon"
					></cdx-icon>
					<div class="ext-articleguidance-notability-option-content">
						<component
							:is="option.action ? 'button' : 'a'"
							v-bind="option.url ? { href: option.url, target: '_blank' } : {}"
							class="ext-articleguidance-notability-option-title"
							@click="option.action && option.action()"
						>
							{{ option.title }}
						</component>
						<p class="ext-articleguidance-notability-option-description">
							{{ option.description }}
						</p>
					</div>
				</div>
			</div>
		</div>
	</step>
</template>

<script>
const { defineComponent, computed } = require( 'vue' );
const { CdxIcon, CdxMessage } = require( '../codex.js' );
const { cdxIconBook, cdxIconLogoWikidata, cdxIconSandbox } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );
const ArticleInfo = require( './ArticleInfo.vue' );

module.exports = defineComponent( {
	name: 'NotabilityStep',
	components: {
		CdxIcon,
		CdxMessage,
		Step,
		ArticleInfo
	},
	setup() {
		const store = useArticleGuidanceStore();

		const activeTags = computed( () => store.getActiveNotabilityTags() );

		const warningMessage = computed( () => {
			const type = store.getBlockingRestriction();
			if ( type ) {
				return mw.message( 'articleguidance-notability-warning-' + type ).text();
			}
			return mw.message( 'articleguidance-notability-warning' ).text();
		} );

		const contributionOptions = computed( () => {
			const options = [];

			if ( activeTags.value.includes( 'wikidata' ) ) {
				options.push( {
					key: 'wikidata',
					icon: cdxIconLogoWikidata,
					title: mw.message( 'articleguidance-notability-option-wikidata-title' ).text(),
					description: mw.message( 'articleguidance-notability-option-wikidata-description' ).text(),
					url: 'https://www.wikidata.org/wiki/Special:NewItem'
				} );
			}

			if ( activeTags.value.includes( 'draft' ) ) {
				options.push( {
					key: 'sandbox',
					icon: cdxIconSandbox,
					title: mw.message( 'articleguidance-notability-option-sandbox-title' ).text(),
					description: mw.message( 'articleguidance-notability-option-sandbox-description' ).text(),
					action: () => store.confirmNotability()
				} );
			}

			options.push( {
				key: 'learn',
				icon: cdxIconBook,
				title: mw.message( 'articleguidance-notability-option-learn-title' ).text(),
				description: mw.message( 'articleguidance-notability-option-learn-description' ).text(),
				url: mw.util.getUrl( 'Help:Contents' )
			} );

			return options;
		} );

		const handleBack = () => {
			store.goBack();
		};

		return {
			contributionOptions,
			warningMessage,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-notability-warning {
	margin-bottom: 24px;
}

.ext-articleguidance-notability-options-heading {
	margin: 0 0 12px 0;
	font-size: @font-size-medium;
	font-weight: @font-weight-bold;
}

.ext-articleguidance-notability-options-list {
	display: flex;
	flex-direction: column;
}

.ext-articleguidance-notability-option {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid @border-color-subtle;

	&:first-child {
		border-top: 1px solid @border-color-subtle;
	}
}

.ext-articleguidance-notability-option-icon {
	color: @color-progressive;
	flex-shrink: 0;
	margin-top: 2px;
}

.ext-articleguidance-notability-option-content {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.ext-articleguidance-notability-option-title {
	font-weight: @font-weight-bold;
	color: @color-progressive;

	&:is( button ) {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font-size: inherit;
		font-family: inherit;
		text-align: start;
	}
}

.ext-articleguidance-notability-option-description {
	margin: 0;
	color: @color-subtle;
	font-size: @font-size-small;
}
</style>
