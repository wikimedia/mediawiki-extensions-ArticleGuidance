<template>
	<step
		step-name="sources"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<article-info></article-info>

		<h3 class="ext-articleguidance-sources-heading">
			{{ $i18n( 'articleguidance-sources-title' ).text() }}
			<span
				v-if="isMandatory"
				class="ext-articleguidance-sources-required-indicator"
			>*</span>
		</h3>
		<p class="ext-articleguidance-sources-subtitle">
			{{ $i18n( 'articleguidance-sources-subtitle' ).text() }}
		</p>

		<!-- Notability warning (if applicable) -->
		<cdx-message
			v-if="hasNotabilityRisk"
			type="warning"
			class="ext-articleguidance-notability-warning"
		>
			<strong>{{ $i18n( 'articleguidance-sources-notability-title' ).text() }}</strong>
			<div class="ext-articleguidance-notability-description">
				{{ $i18n( 'articleguidance-sources-notability-description' ).text() }}
			</div>
		</cdx-message>

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
				{{ $i18n( 'articleguidance-sources-unreliable-warning-description' ).text() }}
			</div>
		</cdx-message>

		<!-- Checking state -->
		<div v-if="checking" class="ext-articleguidance-checking">
			<cdx-progress-indicator show-label>
				{{ $i18n( 'articleguidance-specialnewarticle-checking' ).text() }}
			</cdx-progress-indicator>
		</div>

		<!-- Verified sources list -->
		<div v-if="verifiedSources.length > 0" class="ext-articleguidance-verified-sources">
			<cdx-message
				v-for="( source, index ) in verifiedSources"
				:key="index"
				type="success"
				class="ext-articleguidance-source-message"
			>
				<div class="ext-articleguidance-source-message-content">
					<div class="ext-articleguidance-source-message-text">
						<span class="ext-articleguidance-source-domain">{{ source.domain }}</span>
						<span class="ext-articleguidance-source-status">
							{{ $i18n( 'articleguidance-sources-approved' ).text() }}
						</span>
					</div>
					<cdx-button
						weight="quiet"
						class="ext-articleguidance-source-close"
						:aria-label="$i18n( 'articleguidance-navigation-back' ).text()"
						@click="removeSource( index )"
					>
						<cdx-icon :icon="cdxIconClose"></cdx-icon>
					</cdx-button>
				</div>
			</cdx-message>
		</div>

		<!-- Tips accordion -->
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
				{{
					$i18n( 'articleguidance-sources-tips-title', selectedOutline.label ).text()
				}}
			</template>
			<div class="ext-articleguidance-tips-content">
				<div>
					<div v-if="recommendedSources.length">
						<div
							:class="{
								'ext-articleguidance-tips-title-success':
									hasBothRecommendedAndDiscouragedTips
							}"
						>
							{{ $i18n( 'articleguidance-sources-tips-content-recommended' ).text() }}
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
					<div v-if="discouragedSources.length">
						<div
							:class="{
								'ext-articleguidance-tips-title-warning':
									hasBothRecommendedAndDiscouragedTips
							}"
						>
							{{ $i18n( 'articleguidance-sources-tips-content-discouraged' ).text() }}
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
			</div>
		</cdx-accordion>

		<!-- Actions -->
		<div class="ext-articleguidance-sources-actions">
			<cdx-button
				weight="primary"
				action="progressive"
				:disabled="!canContinue"
				@click="handleContinue"
			>
				{{ $i18n( 'articleguidance-sources-continue' ).text() }}
			</cdx-button>
			<div class="ext-articleguidance-sources-helper">
				{{ helperText }}
			</div>
		</div>
	</step>
</template>

<script>
const { defineComponent, ref, watch, nextTick, computed } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const {
	CdxAccordion, CdxButton, CdxIcon, CdxMessage,
	CdxProgressIndicator, CdxTextInput
} = require( '../codex.js' );
const { cdxIconClose, cdxIconInfoFilled } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { isDuplicate, isValidUrl } = require( '../utils/sources.js' );
const { validateSource } = require( '../api/Sources.js' );
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
		const { selectedOutline, minRequiredSources } = storeToRefs( store );
		const recommendedSources = computed(
			() => selectedOutline.value.recommendedSources.info || []
		);

		const discouragedSources = computed(
			() => selectedOutline.value.discouragedSources.info || []
		);
		const hasTips = computed(
			() => recommendedSources.value.length > 0 || discouragedSources.value.length > 0
		);
		const hasBothRecommendedAndDiscouragedTips = computed(
			() => recommendedSources.value.length > 0 && discouragedSources.value.length > 0
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
				const result = await validateSource( url );
				if ( !result.reliable ) {
					unreliableWarning.value = { domain: result.domain };
					if ( urlInput.value ) {
						urlInput.value.blur();
					}
				} else {
					currentUrl.value = '';
					verifiedSources.value.push( {
						url: url,
						domain: result.domain
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

		const helperText = computed( () => {
			if ( !isMandatory.value ) {
				return mw.message( 'articleguidance-sources-helper' ).text();
			}
			if ( verifiedSources.value.length === 0 ) {
				const raw = selectedOutline.value && selectedOutline.value.label || '';
				const label = raw.charAt( 0 ).toUpperCase() + raw.slice( 1 );
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
		 * Handle continue - navigate to next step
		 */
		const handleContinue = () => {
			store.confirmSources();
		};

		const handleBack = () => {
			store.goBack();
		};

		const hasNotabilityRisk = computed( () => selectedOutline.value &&
				selectedOutline.value.notabilityRisk &&
				selectedOutline.value.notabilityRisk.includes( 'sources' ) );

		return {
			urlInput,
			currentUrl,
			checking,
			isMandatory,
			canContinue,
			helperText,
			validationError,
			unreliableWarning,
			verifiedSources,
			handleVerifyUrl,
			handlePaste,
			removeSource,
			handleContinue,
			handleBack,
			cdxIconClose,
			cdxIconInfoFilled,
			tipsOpen,
			recommendedSources,
			discouragedSources,
			hasTips,
			hasBothRecommendedAndDiscouragedTips,
			selectedOutline,
			hasNotabilityRisk
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

.ext-articleguidance-notability-warning {
	margin-bottom: 16px;

	.ext-articleguidance-notability-description {
		margin: 8px 0 0 0;
	}
}

.ext-articleguidance-url-input-wrapper {
	margin-bottom: 4px;

	.ext-articleguidance-url-input {
		width: 100%;
	}
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

.ext-articleguidance-verified-sources {
	display: flex;
	flex-direction: column;
	margin: 16px 0;
}

.ext-articleguidance-source-message {
	&.cdx-message {
		background-color: @background-color-base;
		border: 0;
		border-radius: 0;
		padding: 12px 0;
	}

	&.cdx-message--success {
		border-bottom: @border-width-base @border-style-base @border-color-subtle;
	}

	.ext-articleguidance-source-message-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
	}

	.ext-articleguidance-source-message-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.ext-articleguidance-source-domain {
		font-weight: @font-weight-bold;
		word-break: break-all;
	}

	.ext-articleguidance-source-status {
		font-size: @font-size-small;
		color: @color-subtle;
	}

	.ext-articleguidance-source-close {
		flex-shrink: 0;
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

.ext-articleguidance-tips-title-success {
	color: @color-success;
	font-weight: bold;
}
.ext-articleguidance-tips-title-warning {
	color: @color-warning;
	font-weight: bold;
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

.ext-articleguidance-sources-helper {
	color: @color-placeholder;
	font-size: @font-size-small;
}
</style>
