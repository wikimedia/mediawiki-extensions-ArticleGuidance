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

			<!-- Conflict row: warning + view-existing on the same line on desktop -->
			<div class="ext-articleguidance-titleconflict-conflict-row">
				<cdx-message
					v-if="titleExists === true"
					type="warning"
					inline
					class="ext-articleguidance-titleconflict-warning"
				>
					{{ existsWarningText }}
				</cdx-message>
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
			<div class="ext-articleguidance-titleconflict-subject-card-wrapper">
				<article-card
					v-if="selectedResult"
					:fit-width="true"
					:title="selectedResult.label"
					:description="selectedResult.description"
					:thumbnail="selectedResult.thumbnail"
				>
				</article-card>
			</div>

			<!-- Actions: Back + Continue -->
			<div class="ext-articleguidance-titleconflict-actions">
				<cdx-button
					class="ext-articleguidance-titleconflict-back-btn"
					weight="quiet"
					@click="handleBack"
				>
					{{ $i18n( 'articleguidance-navigation-back' ).text() }}
				</cdx-button>
				<cdx-button
					weight="primary"
					action="progressive"
					:disabled="!canContinue"
					@click="handleContinue"
				>
					{{ $i18n( 'articleguidance-titleconflict-continue' ).text() }}
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
const instrument = require( '../logging/instrument.js' );
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
			instrument.logTitleConflictShown();
			if ( localTitle.value ) {
				checkExistence();
			}
		} );

		watch( localTitle, ( newTitle ) => {
			store.setArticleTitle( newTitle );
		} );

		const canContinue = computed( () => titleExists.value === false );

		const existsWarningText = computed( () => mw.message( 'articleguidance-titleconflict-exists-warning', localTitle.value ).text() );

		const handleBack = () => {
			store.resetTitleConflict();
			store.goBack();
		};

		const handleContinue = () => {
			instrument.logTitleConflictAction( 'continue' );
			store.confirmTitle();
		};

		const handleUseSuggestion = () => {
			instrument.logTitleConflictAction( 'use_suggestion' );
			localTitle.value = titleSuggestion.value;
		};

		const handleReadArticle = () => {
			instrument.logTitleConflictAction( 'view_existing' );
			window.open( mw.util.getUrl( existingArticleTitle ), '_blank' );
		};

		return {
			localTitle,
			titleExists,
			existsWarningText,
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

.ext-articleguidance-titleconflict-conflict-row {
	// Mobile: dissolve this wrapper so the warning and "view existing" button
	// become direct flex items of the content column. This lets the button be
	// reordered below the actions (see `order` rule below). Desktop restores
	// `display: flex` to keep them side by side.
	display: contents;
}

.ext-articleguidance-titleconflict-selected-subject {
	font-weight: @font-weight-normal;
	font-size: @font-size-small;
	color: @color-subtle;
}

.ext-articleguidance-titleconflict-actions {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;

	.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}

.ext-articleguidance-titleconflict-back-btn {
	display: none;
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-titleconflict-conflict-row {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 16px;
		}

		.ext-articleguidance-titleconflict-actions {
			flex-direction: row;
			justify-content: flex-end;

			.cdx-button {
				width: auto;
				max-width: none;
			}
		}

		.ext-articleguidance-titleconflict-back-btn {
			display: inline-flex;
		}
	}
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
	// Mobile: render below the actions/Continue button (the conflict-row wrapper
	// is `display: contents` there, so this is a flex item of the content
	// column). On desktop it sits to the right of the warning within the row,
	// where this order keeps it after the warning.
	order: 1;
}
</style>
