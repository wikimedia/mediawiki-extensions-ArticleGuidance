<template>
	<step
		step-name="notability"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<cdx-message
			class="ext-articleguidance-notability-warning"
			inline
			type="warning"
		>
			{{ warningMessage }}
		</cdx-message>

		<div class="ext-articleguidance-notability-options">
			<h3 class="ext-articleguidance-notability-options-heading">
				{{ $i18n( 'articleguidance-notability-options-heading' ).text() }}
			</h3>
			<div class="ext-articleguidance-notability-options-list">
				<action-option
					v-for="option in contributionOptions"
					:key="option.key"
					:icon="option.icon"
					:title="option.title"
					:description="option.description"
					:url="option.url || null"
					:action="option.action || null"
					:log="option.log"
				></action-option>
			</div>
			<cdx-button
				class="ext-articleguidance-notability-back-btn"
				weight="quiet"
				@click="handleBack"
			>
				<cdx-icon :icon="cdxIconArrowPrevious"></cdx-icon>
				{{ $i18n( 'articleguidance-navigation-back' ).text() }}
			</cdx-button>
		</div>
	</step>
</template>

<script>
const { defineComponent, computed, onMounted } = require( 'vue' );
const { CdxButton, CdxIcon, CdxMessage } = require( '../codex.js' );
const { cdxIconArrowPrevious, cdxIconBook, cdxIconLogoWikidata, cdxIconSandbox } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { getPageUrl } = require( '../utils/wikidata.js' );
const instrument = require( '../logging/instrument.js' );
const Step = require( './Step.vue' );
const ArticleInfo = require( './ArticleInfo.vue' );
const ActionOption = require( './ActionOption.vue' );

module.exports = defineComponent( {
	name: 'NotabilityStep',
	components: {
		CdxButton,
		CdxIcon,
		CdxMessage,
		Step,
		ArticleInfo,
		ActionOption
	},
	setup() {
		const store = useArticleGuidanceStore();

		const activeTags = computed( () => store.getActiveNotabilityTags() );

		const warningMessage = computed( () => {
			const type = store.getBlockingRestriction();
			if ( type ) {
				// Messages that can be used here:
				// * articleguidance-notability-warning-wikidata
				// * articleguidance-notability-warning-draft
				// * articleguidance-notability-warning-crosswiki
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
					url: getPageUrl( 'Special:NewItem' ),
					log: () => instrument.logNotabilityAction( 'wikidata_item' )
				} );
			}

			if ( activeTags.value.includes( 'draft' ) ) {
				options.push( {
					key: 'sandbox',
					icon: cdxIconSandbox,
					title: mw.message( 'articleguidance-notability-option-sandbox-title' ).text(),
					description: mw.message( 'articleguidance-notability-option-sandbox-description' ).text(),
					action: () => store.confirmNotability(),
					log: () => instrument.logNotabilityAction( 'sandbox' )
				} );
			}

			options.push( {
				key: 'learn',
				icon: cdxIconBook,
				title: mw.message( 'articleguidance-notability-option-learn-title' ).text(),
				description: mw.message( 'articleguidance-notability-option-learn-description' ).text(),
				url: mw.util.getUrl( 'Help:Contents' ),
				log: () => instrument.logNotabilityAction( 'learn' )
			} );

			return options;
		} );

		onMounted( () => {
			instrument.logNotabilityCheckShown( activeTags.value );
		} );

		const handleBack = () => {
			store.goBack();
		};

		return {
			contributionOptions,
			warningMessage,
			handleBack,
			cdxIconArrowPrevious
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
	gap: 8px;
}

.ext-articleguidance-notability-back-btn {
	display: none;
	margin-top: 20px;
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-notability-options {
			max-width: none;
		}

		// Size the list to its widest card's content (min 400px); children
		// stretch to that width so the options stay aligned.
		.ext-articleguidance-notability-options-list {
			width: fit-content;
			min-width: 400px;
			max-width: 100%;
		}

		.ext-articleguidance-notability-back-btn {
			display: inline-flex;
		}
	}
}
</style>
