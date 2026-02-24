<template>
	<step
		step-name="sources"
		:title="$i18n( 'articleguidance-sources-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<p class="ext-articleguidance-sources-subtitle">
			{{ $i18n( 'articleguidance-sources-subtitle', searchQuery ).text() }}
		</p>

		<!-- Notability warning (if applicable) -->
		<cdx-message
			v-if="selectedOutline.notabilityRisk"
			type="warning"
			class="ext-articleguidance-notability-warning"
		>
			<strong>{{ $i18n( 'articleguidance-sources-notability-title' ).text() }}</strong>
			<p class="ext-articleguidance-notability-description">
				{{ $i18n( 'articleguidance-sources-notability-description' ).text() }}
			</p>
		</cdx-message>

		<!-- References section -->
		<div class="ext-articleguidance-references-section">
			<h3>{{ $i18n( 'articleguidance-sources-references-title' ).text() }}</h3>
			<p class="ext-articleguidance-references-description">
				{{ $i18n( 'articleguidance-sources-description' ).text() }}
			</p>

			<!-- URL input field -->
			<div class="ext-articleguidance-url-input-wrapper">
				<cdx-text-input
					v-model="currentUrl"
					:placeholder="$i18n( 'articleguidance-sources-url-placeholder' ).text()"
					class="ext-articleguidance-url-input"
					@keyup.enter="handleVerifyUrl"
				>
				</cdx-text-input>
				<cdx-button
					weight="normal"
					action="progressive"
					:disabled="!currentUrl.trim()"
					@click="handleVerifyUrl"
				>
					{{ $i18n( 'articleguidance-sources-check-button' ).text() }}
				</cdx-button>
			</div>

			<!-- Verified sources list -->
			<div v-if="verifiedSources.length > 0" class="ext-articleguidance-verified-sources">
				<div
					v-for="( source, index ) in verifiedSources"
					:key="index"
					class="ext-articleguidance-source-item"
					:class="{
						'ext-articleguidance-source-item--accepted': source.reliable,
						'ext-articleguidance-source-item--rejected': !source.reliable
					}"
				>
					<div class="ext-articleguidance-source-content">
						<span class="ext-articleguidance-source-url">{{ source.url }}</span>
						<span
							v-if="!source.reliable"
							class="ext-articleguidance-source-reason"
						>
							{{ source.reason }}
						</span>
					</div>
					<cdx-button
						weight="quiet"
						action="destructive"
						class="ext-articleguidance-source-remove"
						@click="removeSource( index )"
					>
						{{ $i18n( 'articleguidance-sources-remove-button' ).text() }}
					</cdx-button>
				</div>
			</div>
		</div>

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
		</div>
	</step>
</template>

<script>
const { defineComponent, ref, computed, watch } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxButton, CdxMessage, CdxTextInput } = require( '../codex.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );

// Unreliable domains to reject
const UNRELIABLE_DOMAINS = [
	// Social media
	'facebook.com',
	'twitter.com',
	'x.com',
	'instagram.com',
	'tiktok.com',
	'linkedin.com',
	'reddit.com',
	'tumblr.com',
	'pinterest.com',
	'snapchat.com',
	// AI/Generated content
	'chatgpt.com',
	'openai.com',
	'claude.ai',
	'bard.google.com',
	'character.ai',
	// User-generated content platforms
	'medium.com',
	'substack.com',
	'wordpress.com',
	'blogger.com',
	'wix.com'
];

module.exports = defineComponent( {
	name: 'SourcesStep',
	components: {
		CdxButton,
		CdxMessage,
		CdxTextInput,
		Step
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, searchQuery } = storeToRefs( store );

		// Current URL being entered
		const currentUrl = ref( '' );
		// Initialize from store so back-navigation preserves entered sources
		const verifiedSources = ref(
			store.references.map( ( url ) => ( { url, reliable: true } ) )
		);

		// Keep store in sync as sources are added/removed
		watch( verifiedSources, ( sources ) => {
			store.setReferences( sources.filter( ( s ) => s.reliable ).map( ( s ) => s.url ) );
		}, { deep: true } );

		/**
		 * Check if a URL is from an unreliable domain
		 *
		 * @param {string} url - The URL to check
		 * @return {Object|null} Object with reason if unreliable, null if reliable
		 */
		const checkUrlReliability = ( url ) => {
			try {
				// Add protocol if missing
				let urlToParse = url;
				if ( !/^https?:\/\//i.test( url ) ) {
					urlToParse = 'https://' + url;
				}

				const urlObj = new URL( urlToParse );
				const hostname = urlObj.hostname.toLowerCase().replace( /^www\./, '' );

				for ( const domain of UNRELIABLE_DOMAINS ) {
					if ( hostname === domain || hostname.endsWith( '.' + domain ) ) {
						return {
							reliable: false,
							reason: mw.message( 'articleguidance-sources-unreliable-domain' ).text()
						};
					}
				}

				return { reliable: true };
			} catch ( e ) {
				return {
					reliable: false,
					reason: mw.message( 'articleguidance-sources-invalid-url' ).text()
				};
			}
		};

		/**
		 * Verify and add the current URL
		 */
		const handleVerifyUrl = () => {
			const url = currentUrl.value.trim();
			if ( !url ) {
				return;
			}

			const reliabilityCheck = checkUrlReliability( url );
			const sourceEntry = Object.assign( { url: url }, reliabilityCheck );
			verifiedSources.value.push( sourceEntry );

			// Clear the input
			currentUrl.value = '';
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
		 * Check if user can continue based on number of reliable sources
		 * Requires 1 reliable source for regular articles, 2 for notability risk
		 */
		const canContinue = computed( () => {
			const reliableCount = verifiedSources.value.filter( ( s ) => s.reliable ).length;
			const requiredCount = selectedOutline.value.notabilityRisk ? 2 : 1;
			return reliableCount >= requiredCount;
		} );

		/**
		 * Handle continue - emit only accepted (reliable) references to parent
		 */
		const handleContinue = () => {
			store.confirmSources();
		};

		// Handle back navigation
		const handleBack = () => {
			store.goBack();
		};

		return {
			selectedOutline,
			searchQuery,
			currentUrl,
			verifiedSources,
			handleVerifyUrl,
			removeSource,
			canContinue,
			handleContinue,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-sources-step {
	max-width: 900px;
	margin: 0 auto;
}

.ext-articleguidance-sources-subtitle {
	margin: 4px 0 16px 0;
	font-weight: @font-weight-bold;
}

.ext-articleguidance-notability-warning {
	margin-bottom: 24px;

	.ext-articleguidance-notability-description {
		margin: 8px 0 0 0;
	}
}

.ext-articleguidance-references-section {
	margin-bottom: 24px;
	padding: 16px;
	border-radius: 2px;
	background-color: @background-color-neutral-subtle;
	border-left: 3px solid @color-progressive;

	h3 {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 8px 0;
		color: @color-base;
	}
}

.ext-articleguidance-references-description {
	margin: 0 0 16px 0;
	color: @color-subtle;
	font-size: 14px;
}

.ext-articleguidance-url-input-wrapper {
	display: flex;
	gap: 8px;
	margin-bottom: 16px;

	.ext-articleguidance-url-input {
		flex: 1;
	}
}

.ext-articleguidance-verified-sources {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 16px;
}

.ext-articleguidance-source-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px;
	border-radius: 2px;
	border: 2px solid;
	gap: 12px;

	&--accepted {
		background-color: @background-color-success-subtle;
		border-color: @color-success;
	}

	&--rejected {
		background-color: @background-color-error-subtle;
		border-color: @color-error;
	}
}

.ext-articleguidance-source-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.ext-articleguidance-source-url {
	font-weight: 600;
	word-break: break-all;
}

.ext-articleguidance-source-reason {
	font-size: 14px;
	color: @color-subtle;
	font-style: italic;
}

.ext-articleguidance-source-remove {
	flex-shrink: 0;
}

.ext-articleguidance-sources-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: 32px;
	padding-top: 24px;
	border-top: 1px solid @border-color-subtle;
}
</style>
