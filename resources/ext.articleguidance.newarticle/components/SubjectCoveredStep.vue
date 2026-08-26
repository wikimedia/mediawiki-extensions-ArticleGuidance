<template>
	<step
		step-name="subjectcovered"
		:title="$i18n( 'articleguidance-specialnewarticle-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<div class="ext-articleguidance-subjectcovered-subtitle">
			{{ $i18n( 'articleguidance-subjectcovered-subtitle' ).text() }}
		</div>
		<article-card
			:fit-width="true"
			:interactive="true"
			:thumbnail="localArticleInfo.thumbnail"
			:title="localArticleInfo.title"
			:description="localArticleInfo.description"
			:outline-name="localArticleInfo.outlineName"
			@click="handleReadArticle"
		>
		</article-card>
		<cdx-button
			weight="primary"
			action="progressive"
			class="ext-articleguidance-subjectcovered-button"
			@click="handleImproveArticle"
		>
			{{ $i18n( 'articleguidance-subjectcovered-button' ).text() }}
		</cdx-button>

		<!--
			Secondary action for users who followed a red link: finish the redirect
			they came for instead of writing an article (T426844). Nothing renders
			once a created message has been dismissed, because the red-link title
			is no longer free.
		-->
		<div
			v-if="showRedirectSection"
			class="ext-articleguidance-subjectcovered-redirect"
		>
			<template v-if="redirectState === 'idle'">
				<cdx-button
					class="ext-articleguidance-subjectcovered-button"
					@click="handleCreateRedirect"
				>
					<cdx-icon :icon="redirectIcon"></cdx-icon>
					{{ $i18n( 'articleguidance-subjectcovered-redirect-button' ).text() }}
				</cdx-button>
				<div class="ext-articleguidance-subjectcovered-redirect-description">
					{{ redirectDescriptionText }}
				</div>
			</template>

			<cdx-progress-indicator v-else-if="redirectState === 'saving'" show-label>
				{{ $i18n( 'articleguidance-subjectcovered-redirect-saving' ).text() }}
			</cdx-progress-indicator>

			<cdx-message
				v-else-if="redirectState === 'created'"
				type="success"
				:allow-user-dismiss="true"
				@user-dismissed="handleDismissRedirectMessage"
			>
				{{ redirectSuccessText }}
			</cdx-message>

			<cdx-message
				v-else-if="redirectState === 'error'"
				type="error"
				:allow-user-dismiss="true"
				@user-dismissed="handleDismissRedirectMessage"
			>
				{{ redirectErrorText }}
				<!--
					Only offered while another attempt could still succeed: once the
					title is taken, retrying would fail identically.
				-->
				<cdx-button
					v-if="canCreateRedirect"
					class="ext-articleguidance-subjectcovered-redirect-retry"
					weight="quiet"
					action="progressive"
					@click="handleCreateRedirect"
				>
					{{ $i18n( 'articleguidance-subjectcovered-redirect-retry' ).text() }}
				</cdx-button>
			</cdx-message>
		</div>
	</step>
</template>

<script>
const { defineComponent, computed, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxButton, CdxIcon, CdxMessage, CdxProgressIndicator } = require( '../codex.js' );
const { cdxIconArticleRedirect } = require( '../icons.json' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const useRedirectCreation = require( '../composables/useRedirectCreation.js' );
const { getEditArticleUrl } = require( '../utils/articleUrl.js' );
const instrument = require( '../logging/instrument.js' );

module.exports = defineComponent( {
	name: 'SubjectCoveredStep',
	components: {
		Step,
		CdxButton,
		CdxIcon,
		CdxMessage,
		CdxProgressIndicator,
		ArticleCard
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { localArticleInfo, searchQuery, redLinkTitle } = storeToRefs( store );

		const {
			redirectState,
			redirectErrorCode,
			canCreateRedirect,
			checkRedLink,
			createRedirect,
			dismissRedirectMessage
		} = useRedirectCreation( {
			redLinkTitle,
			searchQuery,
			targetTitle: computed( () => localArticleInfo.value.title )
		} );

		checkRedLink();

		onMounted( () => {
			instrument.logSubjectCoveredShown();
		} );

		const showRedirectSection = computed( () => redirectState.value === 'idle' ?
			canCreateRedirect.value :
			redirectState.value !== 'done'
		);

		const redirectDescriptionText = computed( () => mw.message(
			'articleguidance-subjectcovered-redirect-description',
			redLinkTitle.value,
			localArticleInfo.value.title
		).text() );

		const redirectSuccessText = computed( () => mw.message(
			'articleguidance-subjectcovered-redirect-success',
			redLinkTitle.value,
			localArticleInfo.value.title
		).text() );

		const PERMISSION_CODES = [
			'permissiondenied',
			'protectedpage',
			'protectednamespace',
			'cantcreate',
			'cantcreate-anon',
			'blocked',
			'autoblocked'
		];

		// Only the reachable failures get their own wording. Malformed titles and
		// the like are ruled out by the step before it offers the action, so they
		// fall through to the generic message along with network errors.
		const redirectErrorText = computed( () => {
			const code = redirectErrorCode.value;
			if ( code === 'articleexists' ) {
				return mw.message(
					'articleguidance-subjectcovered-redirect-error-exists',
					redLinkTitle.value
				).text();
			}
			if ( PERMISSION_CODES.includes( code ) ) {
				return mw.message(
					'articleguidance-subjectcovered-redirect-error-permission'
				).text();
			}
			return mw.message( 'articleguidance-subjectcovered-redirect-error' ).text();
		} );

		const handleBack = () => {
			store.goBack();
		};
		const handleImproveArticle = () => {
			instrument.logSubjectCoveredAction( 'improve' );
			location.href = getEditArticleUrl(
				localArticleInfo.value.title
			);
		};
		const handleReadArticle = () => {
			instrument.logSubjectCoveredAction( 'read' );
			open( mw.util.getUrl( localArticleInfo.value.title ), '_blank' );
		};
		const handleCreateRedirect = () => {
			instrument.logSubjectCoveredAction( 'create_redirect' );
			createRedirect();
		};
		const handleDismissRedirectMessage = () => {
			dismissRedirectMessage();
		};
		return {
			localArticleInfo,
			redirectState,
			canCreateRedirect,
			showRedirectSection,
			redirectDescriptionText,
			redirectSuccessText,
			redirectErrorText,
			redirectIcon: cdxIconArticleRedirect,
			handleBack,
			handleImproveArticle,
			handleReadArticle,
			handleCreateRedirect,
			handleDismissRedirectMessage
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-subjectcovered-subtitle {
	margin-bottom: 0.75rem;
	font-weight: @font-weight-bold;
	font-size: @font-size-medium;
}

.ext-articleguidance-subjectcovered-button {
	margin-top: 0.5rem;

	&.cdx-button {
		width: 100%;
		max-width: 400px;
	}
}

.ext-articleguidance-subjectcovered-redirect {
	.cdx-message {
		margin-top: 0.5rem;
		max-width: 400px;
	}
}

.ext-articleguidance-subjectcovered-redirect-description {
	// Sits under the stacked buttons, so it lines up with their shared width.
	max-width: 400px;
	margin-top: 0.5rem;
	color: @color-subtle;
	font-size: @font-size-medium;
}

.ext-articleguidance-subjectcovered-redirect-retry {
	&.cdx-button {
		// Sits inline after the error text inside the message body.
		margin-left: 0.25em;
	}
}
</style>
