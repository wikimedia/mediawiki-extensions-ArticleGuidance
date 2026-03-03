<template>
	<step
		step-name="sources"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<!-- Article title + type chip -->
		<div class="ext-articleguidance-sources-article-info">
			<h2 class="ext-articleguidance-sources-article-title">
				{{ searchQuery }}
			</h2>
			<cdx-info-chip v-if="selectedOutline">
				{{ selectedOutline.label }}
			</cdx-info-chip>
		</div>

		<h3 class="ext-articleguidance-sources-heading">
			{{ $i18n( 'articleguidance-sources-title' ).text() }}
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
				v-model="currentUrl"
				:placeholder="$i18n( 'articleguidance-sources-url-placeholder' ).text()"
				:disabled="checking"
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
				:type="source.reliable ? 'success' : 'warning'"
				class="ext-articleguidance-source-message"
			>
				<div class="ext-articleguidance-source-message-content">
					<div class="ext-articleguidance-source-message-text">
						<span class="ext-articleguidance-source-domain">{{ source.domain }}</span>
						<span class="ext-articleguidance-source-status">
							{{
								source.reliable ?
									$i18n( 'articleguidance-sources-approved' ).text() :
									$i18n( 'articleguidance-sources-not-recommended' ).text()
							}}
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
			v-model="tipsOpen"
			class="ext-articleguidance-tips-accordion"
			separation="outline"
		>
			<template #title>
				<cdx-icon
					:icon="cdxIconInfoFilled"
					class="ext-articleguidance-tips-info-icon"
				></cdx-icon>
				{{ $i18n( 'articleguidance-sources-tips-title' ).text() }}
			</template>
			<div class="ext-articleguidance-tips-content">
				{{ $i18n( 'articleguidance-sources-tips-content' ).text() }}
			</div>
		</cdx-accordion>

		<!-- Actions -->
		<div class="ext-articleguidance-sources-actions">
			<cdx-button
				weight="primary"
				action="progressive"
				@click="handleContinue"
			>
				{{ $i18n( 'articleguidance-sources-continue' ).text() }}
			</cdx-button>
			<div class="ext-articleguidance-sources-helper">
				{{ $i18n( 'articleguidance-sources-helper' ).text() }}
			</div>
		</div>
	</step>
</template>

<script>
const { defineComponent, ref, watch, nextTick, computed } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const {
	CdxAccordion, CdxButton, CdxIcon, CdxInfoChip, CdxMessage,
	CdxProgressIndicator, CdxTextInput
} = require( '../codex.js' );
const { cdxIconClose, cdxIconInfoFilled } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { extractDomain, isDuplicate, isUnreliable, isValidUrl } = require( '../utils/sources.js' );
const Step = require( './Step.vue' );

module.exports = defineComponent( {
	name: 'SourcesStep',
	components: {
		CdxAccordion,
		CdxButton,
		CdxIcon,
		CdxInfoChip,
		CdxMessage,
		CdxProgressIndicator,
		CdxTextInput,
		Step
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, searchQuery } = storeToRefs( store );

		// Current URL being entered
		const currentUrl = ref( '' );
		// Whether we are currently checking a URL
		const checking = ref( false );
		// Inline validation error (invalid URL or duplicate)
		const validationError = ref( null );
		// Tips accordion open state (expanded by default)
		const tipsOpen = ref( true );

		// Initialize from store so back-navigation preserves entered sources
		const verifiedSources = ref(
			store.references.map( ( url ) => ( {
				url: url,
				domain: extractDomain( url ),
				reliable: true
			} ) )
		);

		// Keep store in sync as sources are added/removed
		watch( verifiedSources, ( sources ) => {
			store.setReferences(
				sources.filter( ( s ) => s.reliable ).map( ( s ) => s.url )
			);
		}, { deep: true } );

		/**
		 * Verify and add the current URL.
		 * Validates synchronously first, then simulates an async check
		 * with a brief delay to show the progress indicator.
		 */
		const handleVerifyUrl = () => {
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

			// Start async-style check
			checking.value = true;
			currentUrl.value = '';

			setTimeout( () => {
				const reliable = !isUnreliable( url );

				verifiedSources.value.push( {
					url: url,
					domain: extractDomain( url ),
					reliable: reliable
				} );

				// Auto-expand tips if source is not recommended
				if ( !reliable ) {
					tipsOpen.value = true;
				}

				checking.value = false;
			}, 500 );
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

		/**
		 * Handle continue — step is optional by default, always enabled
		 */
		const handleContinue = () => {
			store.confirmSources();
		};

		const handleBack = () => {
			store.goBack();
		};

		const hasNotabilityRisk = computed( () => selectedOutline &&
				selectedOutline.notabilityRisk &&
				selectedOutline.notabilityRisk.length > 0 );

		return {
			selectedOutline,
			searchQuery,
			currentUrl,
			checking,
			validationError,
			tipsOpen,
			verifiedSources,
			handleVerifyUrl,
			handlePaste,
			removeSource,
			handleContinue,
			handleBack,
			cdxIconClose,
			cdxIconInfoFilled,
			hasNotabilityRisk
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-sources-article-info {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;

	.cdx-info-chip {
		border: 0;
	}
}

.ext-articleguidance-sources-article-title {
	font-size: @font-size-xx-large;
	margin: 0;
	color: @color-base;
	border: 0;
	line-height: @line-height-xx-large;
}

.ext-articleguidance-sources-heading {
	font-size: @font-size-x-large;
	font-weight: @font-weight-bold;
	margin: 0 0 4px 0;
	color: @color-base;
	border: 0;
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

	&.cdx-message--success,
	&.cdx-message--warning {
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
