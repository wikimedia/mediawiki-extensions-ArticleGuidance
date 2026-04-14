<template>
	<step
		step-name="titleconflict"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<div class="ext-articleguidance-titleconflict-content">
			<!-- Editable title input -->
			<cdx-text-input
				v-model="localTitle"
				:placeholder="$i18n( 'articleguidance-specialnewarticle-title-placeholder' ).text()"
				class="ext-articleguidance-titleconflict-input"
			>
			</cdx-text-input>

			<!-- Conflict warning -->
			<cdx-message
				v-if="titleExists === true"
				type="warning"
				inline
				class="ext-articleguidance-titleconflict-warning"
			>
				<!-- eslint-disable-next-line vue/no-v-html -->
				<span v-html="existsWarningHtml"></span>
			</cdx-message>

			<!-- Suggested alternative title -->
			<div
				v-if="titleSuggestion && titleExists === true"
				class="ext-articleguidance-titleconflict-suggestion"
			>
				{{ $i18n( 'articleguidance-titleconflict-suggestion-prefix' ).text() }}
				<cdx-button
					weight="quiet"
					action="progressive"
					class="ext-articleguidance-titleconflict-suggestion-button"
					@click="handleUseSuggestion"
				>
					{{ titleSuggestion }}
				</cdx-button>
			</div>

			<!-- Selected subject -->
			<div class="ext-articleguidance-titleconflict-selected-subject">
				{{ $i18n( 'articleguidance-titleconflict-selected-subject' ).text() }}
			</div>
			<article-card
				v-if="selectedResult"
				:title="selectedResult.label"
				:description="selectedResult.description"
				:thumbnail="selectedResult.thumbnail"
			>
			</article-card>

			<!-- Continue button -->
			<cdx-button
				weight="primary"
				action="progressive"
				:disabled="!canContinue"
				class="ext-articleguidance-titleconflict-continue"
				@click="handleContinue"
			>
				{{ $i18n( 'articleguidance-titleconflict-continue' ).text() }}
			</cdx-button>

			<!-- View existing article link -->
			<div
				class="ext-articleguidance-titleconflict-viewexisting"
			>
				<cdx-button
					weight="quiet"
					action="progressive"
					class="ext-articleguidance-titleconflict-viewexisting-btn"
					@click="handleReadArticle"
				>
					{{ $i18n( 'articleguidance-titleconflict-viewexisting' ).text() }}
					<cdx-icon :icon="cdxIconLinkExternal"></cdx-icon>
				</cdx-button>
			</div>
		</div>
	</step>
</template>

<script>
const { defineComponent, ref, computed, watch, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxTextInput, CdxMessage, CdxButton, CdxIcon } = require( '../codex.js' );
const { cdxIconLinkExternal } = require( '../icons.json' );
const useArticleExist = require( '../composables/useArticleExist.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );

module.exports = defineComponent( {
	name: 'TitleConflictStep',
	components: {
		CdxTextInput,
		CdxMessage,
		CdxButton,
		CdxIcon,
		Step,
		ArticleCard
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedResult, titleSuggestion } = storeToRefs( store );

		const localTitle = ref( store.articleTitle || '' );
		const existingArticleTitle = localTitle.value;

		const { exists: titleExists, checkExistence } = useArticleExist( localTitle );

		onMounted( () => {
			if ( localTitle.value ) {
				checkExistence();
			}
		} );

		watch( localTitle, ( newTitle ) => {
			store.setArticleTitle( newTitle );
		} );

		const canContinue = computed( () => titleExists.value === false );

		const existsWarningHtml = computed( () => mw.message( 'articleguidance-specialnewarticle-exists-warning', localTitle.value ).parse() );

		const handleBack = () => {
			store.resetTitleConflict();
			store.goBack();
		};

		const handleContinue = () => {
			store.confirmTitle();
		};

		const handleUseSuggestion = () => {
			localTitle.value = titleSuggestion.value;
		};

		const handleReadArticle = () => {
			window.open( mw.util.getUrl( existingArticleTitle ), '_blank' );
		};

		return {
			localTitle,
			titleExists,
			existsWarningHtml,
			titleSuggestion,
			selectedResult,
			canContinue,
			handleBack,
			handleContinue,
			handleUseSuggestion,
			handleReadArticle,
			cdxIconLinkExternal
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-titleconflict-content {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.ext-articleguidance-titleconflict-warning {
	margin: 0;
}

.ext-articleguidance-titleconflict-suggestion {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: @font-size-medium;
	padding-left: 28px; // 20px for the warning icon + 8px gap
}

.ext-articleguidance-titleconflict-suggestion:dir(rtl) {
	padding-left: 0;
	padding-right: 28px;
}

.ext-articleguidance-titleconflict-suggestion-button{
	&.cdx-button {
		padding-left: 0;
		padding-right: 0;
	}
}

.ext-articleguidance-titleconflict-input {
	width: 100%;

	.cdx-text-input {
		&__input {
			font-size: @font-size-x-large;
			line-height: @line-height-x-large;
			caret-color: @color-progressive;

			&, &:focus, &:hover {
				outline: 0;
				box-shadow: none;
				border-top: 0;
				border-left: 0;
				border-right: 0;
				border-bottom: 1px solid @border-color-base;
			}

			&:focus, &:focus-visible {
				border-bottom: 2px solid @color-progressive;
			}
		}
	}
}

.ext-articleguidance-titleconflict-selected-subject {
	font-weight: @font-weight-bold;
	font-size: @font-size-x-large;
	color: @color-subtle;
}

.ext-articleguidance-titleconflict-continue {
	&.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}

.ext-articleguidance-titleconflict-viewexisting {
	display: flex;
	justify-content: center;
}
.ext-articleguidance-titleconflict-viewexisting-btn {
	background: none;
	border: none;
	color: @color-progressive;
	cursor: pointer;
	font-size: @font-size-small;
	font-weight: @font-weight-normal;
	display: flex;
	align-items: center;
	gap: 0.25em;
}
</style>
