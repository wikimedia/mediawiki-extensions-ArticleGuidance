<template>
	<step
		step-name="sources"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<div class="ext-articleguidance-sources-layout">
			<!-- Left column: form + actions -->
			<div class="ext-articleguidance-sources-main">
				<h3 class="ext-articleguidance-sources-heading">
					{{ $i18n( 'articleguidance-sources-title' ).text() }}
					<span
						v-if="isMandatory"
						class="ext-articleguidance-sources-required-indicator"
					>*</span>
				</h3>
				<p class="ext-articleguidance-sources-subtitle">
					{{ subtitleMessage }}
				</p>

				<!-- URL input field -->
				<div class="ext-articleguidance-url-input-wrapper">
					<cdx-text-input
						ref="urlInput"
						v-model="currentUrl"
						:placeholder="$i18n( 'articleguidance-sources-url-placeholder' ).text()"
						:disabled="checking"
						:status="unreliableWarning ? 'error' : 'default'"
						:clearable="true"
						class="ext-articleguidance-url-input"
						@keyup.enter="handleVerifyUrl"
						@paste="handlePaste"
					>
					</cdx-text-input>
					<cdx-button
						:disabled="!currentUrl.trim() || checking"
						:aria-label="$i18n( 'articleguidance-sources-add-source' ).text()"
						class="ext-articleguidance-add-source-button"
						@click="handleVerifyUrl"
					>
						<cdx-icon :icon="cdxIconAdd"></cdx-icon>
						<span class="ext-articleguidance-add-source-label">{{
							$i18n( 'articleguidance-sources-add-source' ).text()
						}}</span>
					</cdx-button>
				</div>

				<!-- Inline validation error -->
				<div
					v-if="validationError"
					class="ext-articleguidance-validation-error"
				>
					{{ validationError }}
				</div>

				<!-- Unreliable source warning -->
				<cdx-message
					v-if="unreliableWarning"
					type="warning"
					class="ext-articleguidance-unreliable-warning"
				>
					<strong>
						{{ $i18n( 'articleguidance-sources-unreliable-warning-title' ).text() }}
					</strong>
					<div class="ext-articleguidance-unreliable-description">
						{{
							$i18n( 'articleguidance-sources-unreliable-warning-description' ).text()
						}}
					</div>
				</cdx-message>

				<!-- Checking state -->
				<div v-if="checking" class="ext-articleguidance-checking">
					<cdx-progress-indicator show-label>
						{{ $i18n( 'articleguidance-specialnewarticle-checking' ).text() }}
					</cdx-progress-indicator>
				</div>

				<!-- Verified sources list -->
				<cdx-message
					v-for="( source, index ) in verifiedSources"
					:key="source.url"
					:type="source.classification === 'recommended' ? 'success' : 'notice'"
					class="ext-articleguidance-source-message"
					allow-user-dismiss
					@user-dismissed="removeSource( index )"
				>
					<p class="ext-articleguidance-source-domain">
						{{ source.domain }}
					</p>
					<p v-if="source.title" class="ext-articleguidance-source-title">
						{{ source.title }}
					</p>
				</cdx-message>

				<!-- Tips accordion (mobile only, hidden on desktop) -->
				<cdx-accordion
					v-if="hasTips"
					v-model="tipsOpen"
					class="ext-articleguidance-tips-accordion"
					separation="outline"
				>
					<template #title>
						<cdx-icon
							:icon="cdxIconInfoFilled"
							class="ext-articleguidance-tips-info-icon"
						></cdx-icon>
						{{ tipsTitle }}
					</template>
					<div class="ext-articleguidance-tips-content">
						<div v-if="recommendedSources.length">
							<div
								:class="unreliableWarning ?
									'ext-articleguidance-tips-title-highlighted' :
									'ext-articleguidance-tips-title-regular'
								"
							>
								{{ recommendedTitle }}
							</div>
							<ul class="ext-articleguidance-tip-list">
								<!-- eslint-disable vue/no-v-html -->
								<li
									v-for="( item, i ) in recommendedSources"
									:key="'rec-' + i"
									v-html="item"
								></li>
								<!-- eslint-enable vue/no-v-html -->
							</ul>
						</div>
						<div v-if="unreliableWarning && discouragedSources.length">
							<div class="ext-articleguidance-tips-title-warning">
								{{ discouragedTitle }}
							</div>
							<ul class="ext-articleguidance-tip-list">
								<!-- eslint-disable vue/no-v-html -->
								<li
									v-for="( item, i ) in discouragedSources"
									:key="'disc-' + i"
									v-html="item"
								></li>
								<!-- eslint-enable vue/no-v-html -->
							</ul>
						</div>
					</div>
				</cdx-accordion>

				<!-- Actions -->
				<div class="ext-articleguidance-sources-actions">
					<div class="ext-articleguidance-sources-helper">
						{{ helperText }}
					</div>
					<div class="ext-articleguidance-sources-actions-right">
						<cdx-button
							class="ext-articleguidance-sources-back-btn"
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
							{{ continueLabel }}
						</cdx-button>
					</div>
				</div>
			</div>

			<!-- Right column: static tips block (desktop only) -->
			<div v-if="hasTips" class="ext-articleguidance-sources-tips-static">
				<div class="ext-articleguidance-sources-tips-label">
					<cdx-icon
						:icon="cdxIconInfoFilled"
						class="ext-articleguidance-sources-tips-static-icon"
					></cdx-icon>
					{{ tipsTitle }}
				</div>
				<div class="ext-articleguidance-tips-content">
					<div v-if="recommendedSources.length">
						<div
							:class="unreliableWarning ?
								'ext-articleguidance-tips-title-highlighted' :
								'ext-articleguidance-tips-title-regular'
							"
						>
							{{ recommendedTitle }}
						</div>
						<ul class="ext-articleguidance-tip-list">
							<!-- eslint-disable vue/no-v-html -->
							<li
								v-for="( item, i ) in recommendedSources"
								:key="'srec-' + i"
								v-html="item"
							></li>
							<!-- eslint-enable vue/no-v-html -->
						</ul>
					</div>
					<div v-if="unreliableWarning && discouragedSources.length">
						<div class="ext-articleguidance-tips-title-warning">
							{{ discouragedTitle }}
						</div>
						<ul class="ext-articleguidance-tip-list">
							<!-- eslint-disable vue/no-v-html -->
							<li
								v-for="( item, i ) in discouragedSources"
								:key="'sdisc-' + i"
								v-html="item"
							></li>
							<!-- eslint-enable vue/no-v-html -->
						</ul>
					</div>
				</div>
			</div>
		</div>
	</step>
</template>

<script>
const { defineComponent, onMounted, ref, watch, nextTick, computed } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const {
	CdxAccordion, CdxButton, CdxIcon, CdxMessage,
	CdxProgressIndicator, CdxTextInput
} = require( '../codex.js' );
const { cdxIconAdd, cdxIconInfoFilled } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { isDuplicate, isValidUrl } = require( '../utils/sources.js' );
const { validateSource } = require( '../api/Sources.js' );
const { fetchAllCitationsWikitext } = require( '../api/Citoid.js' );
const instrument = require( '../logging/instrument.js' );
const ArticleInfo = require( './ArticleInfo.vue' );
const Step = require( './Step.vue' );

module.exports = defineComponent( {
	name: 'SourcesStep',
	components: {
		ArticleInfo,
		CdxAccordion,
		CdxButton,
		CdxIcon,
		CdxMessage,
		CdxProgressIndicator,
		CdxTextInput,
		Step
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, minRequiredSources, hasInstructions } = storeToRefs( store );

		onMounted( () => {
			instrument.logSourcesShown();
		} );
		const recommendedSources = computed(
			() => selectedOutline.value.recommendedSources.info || []
		);

		const discouragedSources = computed(
			() => selectedOutline.value.discouragedSources.info || []
		);
		const hasTips = computed(
			() => recommendedSources.value.length > 0 || discouragedSources.value.length > 0
		);
		const tipsTitle = computed( () => mw.message(
			'articleguidance-sources-tips-title', selectedOutline.value.label
		).text() );
		const recommendedTitle = computed(
			() => mw.message( 'articleguidance-sources-tips-content-recommended' ).text()
		);
		const discouragedTitle = computed(
			() => mw.message( 'articleguidance-sources-tips-content-discouraged' ).text()
		);

		// Ref for the URL text input component
		const urlInput = ref( null );
		// Current URL being entered
		const currentUrl = ref( '' );
		// Whether we are currently checking a URL
		const checking = ref( false );
		// Inline validation error (invalid URL or duplicate)
		const validationError = ref( null );
		// Unreliable source warning (null or { domain })
		const unreliableWarning = ref( null );
		// Tips accordion open state (expanded by default)
		const tipsOpen = ref( true );

		// Clear unreliable warning when user modifies the input
		watch( currentUrl, () => {
			if ( unreliableWarning.value ) {
				unreliableWarning.value = null;
			}
		} );

		// Initialize from store so back-navigation preserves entered sources
		const verifiedSources = ref( store.references.slice() );

		// Keep store in sync as sources are added/removed
		watch( verifiedSources, ( sources ) => {
			store.setReferences( sources );
		}, { deep: true } );

		/**
		 * Verify and add the current URL.
		 * Check source reliability with the API.
		 */
		const handleVerifyUrl = async () => {
			const url = currentUrl.value.trim();
			if ( !url ) {
				return;
			}

			// Clear any previous validation error
			validationError.value = null;

			// Inline validation: invalid URL
			if ( !isValidUrl( url ) ) {
				validationError.value = mw.message( 'articleguidance-sources-invalid-url' ).text();
				return;
			}

			// Inline validation: duplicate
			if ( isDuplicate( url, verifiedSources.value ) ) {
				validationError.value = mw.message( 'articleguidance-sources-duplicate' ).text();
				return;
			}

			checking.value = true;

			try {
				const result = await validateSource(
					url,
					null,
					selectedOutline.value && selectedOutline.value.articleType
				);
				const mandatory = minRequiredSources.value > 0;
				if ( result.classification === 'spam' || result.classification === 'discouraged' ) {
					instrument.logAddSource(
						false, url, result.domain, result.classification, mandatory
					);
					unreliableWarning.value = { domain: result.domain };
					if ( urlInput.value ) {
						urlInput.value.blur();
					}
				} else {
					instrument.logAddSource(
						true, url, result.domain, result.classification, mandatory
					);
					currentUrl.value = '';
					verifiedSources.value.push( {
						url: url,
						domain: result.domain,
						classification: result.classification || 'neutral',
						title: result.title
					} );
				}
			} catch ( e ) {
				validationError.value = mw.message( 'articleguidance-sources-check-failed' ).text();
			} finally {
				checking.value = false;
			}
		};

		/**
		 * Handle paste event — read pasted text directly from clipboard data
		 * and trigger verification after the input value updates.
		 *
		 * @param {ClipboardEvent} event - The paste event
		 */
		const handlePaste = ( event ) => {
			const pastedText = event.clipboardData && event.clipboardData.getData( 'text' );
			if ( pastedText && pastedText.trim() ) {
				event.preventDefault();
				currentUrl.value = pastedText.trim();
				nextTick( () => {
					handleVerifyUrl();
				} );
			}
		};

		/**
		 * Remove a source from the verified list
		 *
		 * @param {number} index - Index of the source to remove
		 */
		const removeSource = ( index ) => {
			verifiedSources.value.splice( index, 1 );
		};

		const isMandatory = computed(
			() => minRequiredSources.value > 0
		);

		const canContinue = computed(
			() => verifiedSources.value.length >= minRequiredSources.value
		);

		// When the outline has no guidance, the instructions step is skipped and
		// this becomes the final step, so the button leads straight to writing.
		const continueLabel = computed( () => hasInstructions.value ?
			mw.message( 'articleguidance-sources-continue' ).text() :
			mw.message( 'articleguidance-instructions-start-writing' ).text()
		);

		const helperText = computed( () => {
			if ( !isMandatory.value ) {
				return mw.message( 'articleguidance-sources-helper' ).text();
			}
			if ( verifiedSources.value.length === 0 ) {
				const label = selectedOutline.value && selectedOutline.value.label || '';
				return mw.message( 'articleguidance-sources-helper-required', label ).text();
			}
			if ( verifiedSources.value.length < minRequiredSources.value ) {
				return mw.message(
					'articleguidance-sources-helper-progress',
					verifiedSources.value.length,
					minRequiredSources.value
				).text();
			}
			return mw.message( 'articleguidance-sources-helper' ).text();
		} );

		/**
		 * Handle continue - navigate to next step.
		 * Kick off Citoid prefetch in the background so it may resolve while
		 * the user reads the instructions page.
		 */
		const handleContinue = () => {
			const urls = verifiedSources.value.map( ( s ) => s.url );
			store.setCitationWikitextsPromise( fetchAllCitationsWikitext( urls ) );
			store.confirmSources();
		};

		const handleBack = () => {
			store.goBack();
		};

		const subtitleMessage = computed( () => {
			if ( isMandatory.value ) {
				return mw.message( 'articleguidance-sources-subtitle-notability-risk' ).text();
			}
			return mw.message( 'articleguidance-sources-subtitle' ).text();
		} );

		return {
			urlInput,
			currentUrl,
			checking,
			isMandatory,
			canContinue,
			continueLabel,
			helperText,
			validationError,
			unreliableWarning,
			verifiedSources,
			handleVerifyUrl,
			handlePaste,
			removeSource,
			handleContinue,
			handleBack,
			cdxIconAdd,
			cdxIconInfoFilled,
			tipsOpen,
			recommendedSources,
			discouragedSources,
			hasTips,
			tipsTitle,
			recommendedTitle,
			discouragedTitle,
			subtitleMessage
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-sources-heading {
	font-size: @font-size-x-large;
	font-weight: @font-weight-bold;
	margin: 0 0 4px 0;
	color: @color-base;
	border: 0;

	.ext-articleguidance-sources-required-indicator {
		color: @color-error;
	}
}

.ext-articleguidance-sources-subtitle {
	margin: 0 0 16px 0;
	color: @color-subtle;
}

.ext-articleguidance-url-input-wrapper {
	display: flex;
	flex-direction: row;
	margin-bottom: 4px;
	border: @border-width-base @border-style-base @border-color-base;
	border-radius: @border-radius-base;
	background-color: @background-color-base;

	&:focus-within {
		border-color: @color-progressive;
	}

	.ext-articleguidance-url-input {
		flex: 1;
		min-width: 0;

		.cdx-text-input__input {
			border: 0;
			border-radius: 0;
			background: transparent;

			&:focus {
				outline: 0;
				box-shadow: none;
			}
		}
	}

	.ext-articleguidance-add-source-button {
		flex-shrink: 0;
		border: 0;
		border-inline-start: @border-width-base @border-style-base @border-color-base;
		border-radius: 0 @border-radius-base @border-radius-base 0;
		background-color: @background-color-neutral-subtle;

		&:hover:not( :disabled ) {
			background-color: @background-color-interactive;
		}

		&:disabled {
			background-color: @background-color-neutral-subtle;
		}
	}
}

// Mobile keeps an icon-only add button; the text label is revealed on desktop.
.ext-articleguidance-add-source-label {
	display: none;
}

.ext-articleguidance-validation-error {
	color: @color-error;
	font-size: @font-size-small;
	margin-bottom: 12px;
}

.ext-articleguidance-checking {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 12px 0;
	color: @color-subtle;
	font-size: @font-size-small;
}

.ext-articleguidance-source-message {
	&.cdx-message {
		background-color: @background-color-base;
		border: 0;
		border-radius: 0;
		padding: 12px 0;
	}

	&.cdx-message--success,
	&.cdx-message--notice {
		border-bottom: @border-width-base @border-style-base @border-color-subtle;
	}

	.ext-articleguidance-source-domain {
		margin: 0;
		font-weight: @font-weight-bold;
		word-break: break-all;
	}

	.ext-articleguidance-source-title {
		margin: 0;
		font-size: @font-size-small;
		color: @color-subtle;
	}
}

.ext-articleguidance-unreliable-warning {
	margin: 12px 0;

	.ext-articleguidance-unreliable-description {
		font-size: @font-size-small;
		color: @color-subtle;
		margin-top: 4px;
	}

	&.cdx-message {
		background-color: @background-color-base;
		border: 0;
		border-radius: 0;
		padding: 12px 0;
	}

	&.cdx-message--warning {
		border-bottom: @border-width-base @border-style-base @border-color-subtle;
	}
}

.ext-articleguidance-tips-accordion {
	margin-top: 16px;

	&.cdx-accordion > summary {
		position: relative;
		padding-right: 32px;
		border-bottom: @border-color-subtle solid 1px;
		background-color: @background-color-neutral-subtle;

		&::before {
			position: absolute;
			right: 12px;
		}
	}

	&.cdx-accordion > summary h3 {
		font-weight: @font-weight-normal;
		color: @color-subtle;
	}
}

.ext-articleguidance-tips-info-icon {
	color: @color-subtle;
	margin-right: 8px;
}

.ext-articleguidance-tips-content {
	color: @color-subtle;
	line-height: @line-height-medium;
}

.ext-articleguidance-tips-title-regular {
	color: @color-subtle;
	font-weight: @font-weight-normal;
}

.ext-articleguidance-tips-title-highlighted {
	color: @color-success;
	font-weight: @font-weight-bold;
}

.ext-articleguidance-tips-title-warning {
	color: @color-warning;
	font-weight: @font-weight-bold;
}

.ext-articleguidance-tip-list {
	margin: 0 0 4px 0;
	padding-left: 1.2em;
	color: @color-subtle;
	font-size: inherit;
	line-height: @line-height-medium;
}

.ext-articleguidance-tip-list li {
	margin-bottom: 4px;
	list-style-type: disc;

	p {
		margin: 0;
	}
}

.ext-articleguidance-sources-actions {
	display: flex;
	// Mobile: button on top, helper text centered below it.
	flex-direction: column-reverse;
	margin-top: 32px;
	padding-top: 16px;
	gap: 8px;
	border-top: @border-width-base @border-style-base @border-color-subtle;
}

.ext-articleguidance-sources-actions-right {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	width: 100%;

	.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}

.ext-articleguidance-sources-actions-right > .ext-articleguidance-sources-back-btn {
	display: none;
}

.ext-articleguidance-sources-helper {
	color: @color-placeholder;
	font-size: @font-size-small;
	text-align: center;
}

.ext-articleguidance-sources-tips-static {
	display: none;
}

.ext-articleguidance-sources-tips-label {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: @font-size-small;
	color: @color-subtle;
	margin-bottom: 8px;
}

.ext-articleguidance-sources-tips-static-icon {
	color: @color-base;
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-sources-layout {
			display: grid;
			// Main column flexes; the tips box is capped so it doesn't sprawl.
			grid-template-columns: minmax( 0, 1fr ) minmax( 0, 22em );
			gap: 32px;
			align-items: start;
		}

		// Desktop tips render as an enclosed, bordered box (no accordion).
		.ext-articleguidance-sources-tips-static {
			display: block;
			padding: 16px;
			border: @border-width-base @border-style-base @border-color-subtle;
			border-radius: @border-radius-base;
		}

		.ext-articleguidance-tips-accordion {
			display: none;
		}

		// Desktop has no divider above the Back/Continue row.
		.ext-articleguidance-sources-actions {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
			padding-top: 0;
			border-top: 0;
		}

		// Separate the add button from the input: each gets its own border,
		// and the button reveals its "Add source" text label.
		.ext-articleguidance-url-input-wrapper {
			border: 0;
			background-color: transparent;
			gap: 8px;
			align-items: stretch;
		}

		.ext-articleguidance-url-input {
			border: @border-width-base @border-style-base @border-color-base;
			border-radius: @border-radius-base;
			background-color: @background-color-base;

			&:focus-within {
				border-color: @color-progressive;
			}
		}

		.ext-articleguidance-add-source-button {
			border: @border-width-base @border-style-base @border-color-base;
			border-radius: @border-radius-base;
		}

		.ext-articleguidance-add-source-label {
			display: inline;
		}

		.ext-articleguidance-sources-actions-right {
			flex-direction: row;
			width: auto;

			.cdx-button {
				width: auto;
				max-width: none;
			}
		}

		.ext-articleguidance-sources-back-btn {
			display: inline-flex;
		}

		// Desktop: helper sits inline to the left of the buttons, not centered.
		.ext-articleguidance-sources-helper {
			text-align: start;
		}

		// In the desktop static tips block, "These source types work well:" reads
		// as a bold heading. Scoped to the static block so the mobile accordion
		// label is unchanged.
		.ext-articleguidance-sources-tips-static .ext-articleguidance-tips-title-regular {
			color: @color-base;
			font-weight: @font-weight-bold;
		}
	}
}
</style>
