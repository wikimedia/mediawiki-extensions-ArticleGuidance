<template>
	<div class="ext-articleguidance-outlines-panel">
		<div class="ext-articleguidance-outlines-subtitle">
			{{ $i18n( 'articleguidance-specialnewarticle-disambiguation-title' ).text() }}
		</div>

		<!-- Loading state -->
		<state-message v-if="loading">
			{{ $i18n( 'articleguidance-specialnewarticle-loading' ).text() }}
		</state-message>

		<!-- Error state -->
		<cdx-message
			v-if="error"
			type="error"
			class="ext-articleguidance-error">
			{{ error }}
		</cdx-message>

		<!-- Outlines list -->
		<div v-if="!loading && outlinesList.length > 0" class="ext-articleguidance-outlines-list">
			<article-card
				v-for="outlineItem in outlinesList"
				:key="outlineItem.articleType"
				:title="outlineItem.label"
				:description="outlineItem.description"
				:icon="articleIcon"
				:interactive="true"
				@click="handleSelectOutline( outlineItem )"
			>
			</article-card>
		</div>

		<!-- Exit path: no matching type -->
		<div
			v-if="!loading && outlinesList.length > 0"
			class="ext-articleguidance-outlines-no-match"
		>
			<span class="ext-articleguidance-outlines-no-match-prefix">
				{{ $i18n( 'articleguidance-specialnewarticle-no-matching-type' ).text() }}
			</span>
			<a
				class="ext-articleguidance-outlines-no-match-link"
				:href="missingTypeFeedbackUrl"
				target="_blank"
				rel="noopener noreferrer"
			>
				{{ $i18n( 'articleguidance-specialnewarticle-missing-type-feedback' ).text() }}
				<cdx-icon :icon="cdxIconLinkExternal"></cdx-icon>
			</a>
		</div>
	</div>
</template>

<script>
const { computed, defineComponent, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxIcon, CdxMessage } = require( '../codex.js' );
const { cdxIconArticle, cdxIconLinkExternal } = require( '../icons.json' );
const { scrollToTop } = require( '../utils/scroll.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { getMissingTypeFeedbackUrl } = require( '../utils/projectFeedback.js' );
const instrument = require( '../logging/instrument.js' );
const ArticleCard = require( './ArticleCard.vue' );
const StateMessage = require( './StateMessage.vue' );

module.exports = defineComponent( {
	name: 'OutlinesStep',
	components: {
		CdxIcon,
		CdxMessage,
		ArticleCard,
		StateMessage
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { outlinesList, outlinesLoading: loading, outlinesError: error } =
			storeToRefs( store );

		onMounted( () => {
			store.loadOutlines();
			scrollToTop();
		} );

		const handleSelectOutline = ( outlineItem ) => {
			instrument.logSelectManualTopic( {
				title: outlineItem.title,
				qid: outlineItem.articleType
			} );
			store.selectOutline( outlineItem );
		};

		const missingTypeFeedbackUrl = computed( () => {
			const title = store.articleTitle || store.searchQuery;
			return getMissingTypeFeedbackUrl( title );
		} );

		return {
			outlinesList,
			loading,
			error,
			handleSelectOutline,
			articleIcon: cdxIconArticle,
			cdxIconLinkExternal,
			missingTypeFeedbackUrl
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlines-panel {
	margin-top: 16px;
}

.ext-articleguidance-outlines-subtitle {
	margin: 4px 0 16px 0;
	font-weight: @font-weight-bold;
	font-size: @font-size-x-large;
}

.ext-articleguidance-outlines-list {
	display: flex;
	flex-direction: column;
	gap: 12px;

}

.ext-articleguidance-outlines-no-match {
	margin-top: 24px;
	display: flex;
	justify-content: center;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px;
	text-align: center;
}

.ext-articleguidance-outlines-no-match-prefix {
	color: @color-subtle;
}

.ext-articleguidance-outlines-no-match-link {
	.cdx-mixin-link();

	.cdx-icon {
		color: inherit;
	}

	&:visited {
		.cdx-icon {
			color: @color-link--visited;
		}

		&:hover {
			.cdx-icon {
				color: @color-link--visited--hover;
			}
		}

		&:active {
			.cdx-icon {
				color: @color-link--visited--active;
			}
		}
	}
}

.ext-articleguidance-error {
	margin-bottom: 16px;
}
</style>
