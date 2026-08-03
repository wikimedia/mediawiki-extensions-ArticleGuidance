<template>
	<step
		step-name="updatetitle"
		:title="$i18n( 'articleguidance-updatetitle-title' ).text()"
		:show-back="true"
		@back="handleCancel"
	>
		<div class="ext-articleguidance-updatetitle-content">
			<cdx-text-input
				ref="titleInputRef"
				v-model="localTitle"
				:placeholder="$i18n( 'articleguidance-specialnewarticle-title-placeholder' ).text()"
				class="ext-articleguidance-updatetitle-input"
			>
			</cdx-text-input>

			<cdx-message
				v-if="titleExists === true"
				type="warning"
				inline
				class="ext-articleguidance-updatetitle-warning"
			>
				{{ existsWarningText }}
			</cdx-message>

			<cdx-message
				v-if="showRedLinkReminder"
				type="notice"
				inline
				class="ext-articleguidance-updatetitle-redlink"
			>
				{{ redLinkReminderText }}
				<cdx-button
					weight="quiet"
					action="progressive"
					class="ext-articleguidance-updatetitle-restore-redlink"
					@click="handleRestoreRedLink"
				>
					{{ $i18n( 'articleguidance-updatetitle-restore-redlink' ).text() }}
				</cdx-button>
			</cdx-message>

			<div
				v-if="showOriginalOption"
				class="ext-articleguidance-updatetitle-original"
			>
				{{ originallyTypedText }}
				<cdx-button
					weight="quiet"
					action="progressive"
					class="ext-articleguidance-updatetitle-use-original"
					@click="handleUseOriginal"
				>
					{{ $i18n( 'articleguidance-updatetitle-use-original' ).text() }}
				</cdx-button>
			</div>

			<div class="ext-articleguidance-updatetitle-selected-subject">
				{{ $i18n( 'articleguidance-titleconflict-selected-subject' ).text() }}
			</div>
			<article-card
				v-if="selectedResult"
				:fit-width="true"
				:title="selectedResult.label"
				:description="selectedResult.description"
				:thumbnail="selectedResult.thumbnail"
			>
			</article-card>

			<cdx-button
				weight="primary"
				action="progressive"
				:disabled="!canContinue"
				class="ext-articleguidance-updatetitle-submit"
				@click="handleSubmit"
			>
				{{ $i18n( 'articleguidance-updatetitle-button' ).text() }}
			</cdx-button>

			<cdx-button
				weight="normal"
				class="ext-articleguidance-updatetitle-cancel"
				@click="handleCancel"
			>
				{{ $i18n( 'articleguidance-updatetitle-cancel' ).text() }}
			</cdx-button>
		</div>
	</step>
</template>

<script>
const { defineComponent, ref, computed, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxTextInput, CdxMessage, CdxButton } = require( '../codex.js' );
const useArticleExist = require( '../composables/useArticleExist.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );

module.exports = defineComponent( {
	name: 'UpdateTitleStep',
	components: {
		CdxTextInput,
		CdxMessage,
		CdxButton,
		Step,
		ArticleCard
	},
	setup() {
		const store = useArticleGuidanceStore();
		const {
			selectedResult, originalTypedTitle, isRedLink, redLinkTitle
		} = storeToRefs( store );

		const titleOnOpen = store.articleTitle || store.searchQuery;
		const localTitle = ref( store.articleTitle || store.searchQuery );
		const titleInputRef = ref( null );

		const { exists: titleExists, checkExistence } = useArticleExist( localTitle );

		onMounted( () => {
			if ( localTitle.value ) {
				checkExistence();
			}
			if ( titleInputRef.value ) {
				titleInputRef.value.focus();
			}
		} );

		const canContinue = computed( () => localTitle.value.trim().length > 0 &&
			titleExists.value === false
		);

		const existsWarningText = computed(
			() => mw.message( 'articleguidance-titleconflict-exists-warning', localTitle.value ).text()
		);

		const originallyTypedText = computed(
			() => mw.message( 'articleguidance-updatetitle-originally-typed', originalTypedTitle.value ).text()
		);

		const showOriginalOption = computed( () => !isRedLink.value &&
			originalTypedTitle.value !== null &&
			localTitle.value !== originalTypedTitle.value
		);

		const handleUseOriginal = () => {
			localTitle.value = originalTypedTitle.value;
		};

		const redLinkReminderText = computed(
			() => mw.message( 'articleguidance-updatetitle-redlink-reminder', redLinkTitle.value ).text()
		);

		const showRedLinkReminder = computed( () => isRedLink.value &&
			titleOnOpen === redLinkTitle.value &&
			localTitle.value !== redLinkTitle.value &&
			titleExists.value !== true
		);

		const handleRestoreRedLink = () => {
			localTitle.value = redLinkTitle.value;
		};

		const handleSubmit = () => {
			store.setArticleTitle( localTitle.value );
			store.goBack();
		};

		const handleCancel = () => {
			store.setArticleTitle( titleOnOpen );
			store.goBack();
		};

		return {
			localTitle,
			titleInputRef,
			titleExists,
			existsWarningText,
			originallyTypedText,
			selectedResult,
			showOriginalOption,
			redLinkReminderText,
			showRedLinkReminder,
			handleRestoreRedLink,
			canContinue,
			handleUseOriginal,
			handleSubmit,
			handleCancel
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-updatetitle-content {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.ext-articleguidance-updatetitle-warning {
	margin: 0;
}

.ext-articleguidance-updatetitle-input {
	width: 100%;

	.cdx-text-input {
		&__input {
			font-size: @font-size-x-large;
			line-height: @line-height-x-large;
			caret-color: @color-progressive;

			&,
			&:focus,
			&:hover {
				outline: 0;
				box-shadow: none;
				border-top: 0;
				border-left: 0;
				border-right: 0;
				border-bottom: 1px solid @border-color-base;
			}

			&:focus,
			&:focus-visible {
				border-bottom: 2px solid @color-progressive;
			}
		}
	}
}

.ext-articleguidance-updatetitle-original {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: @font-size-medium;
}

.ext-articleguidance-updatetitle-use-original {
	&.cdx-button {
		padding-left: 0;
		padding-right: 0;
	}
}

.ext-articleguidance-updatetitle-redlink {
	margin: 0;
}

.ext-articleguidance-updatetitle-restore-redlink {
	&.cdx-button {
		padding-left: 0;
		padding-right: 0;
	}
}

.ext-articleguidance-updatetitle-selected-subject {
	font-weight: @font-weight-bold;
	font-size: @font-size-x-large;
	color: @color-subtle;
}

.ext-articleguidance-updatetitle-submit {
	&.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}

.ext-articleguidance-updatetitle-cancel {
	&.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}
</style>
