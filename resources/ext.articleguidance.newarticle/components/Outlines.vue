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
				@click="handleSelectOutline( outlineItem )"
			>
			</article-card>
		</div>
	</div>
</template>

<script>
const { defineComponent, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxMessage } = require( '../codex.js' );
const { cdxIconArticle } = require( '../icons.json' );
const { scrollToTop } = require( '../utils/scroll.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const ArticleCard = require( './ArticleCard.vue' );
const StateMessage = require( './StateMessage.vue' );

module.exports = defineComponent( {
	name: 'OutlinesStep',
	components: {
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
			store.selectOutline( outlineItem );
		};

		return {
			outlinesList,
			loading,
			error,
			handleSelectOutline,
			articleIcon: cdxIconArticle
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

	.ext-articleguidance-article-card {
		.cdx-card__text__title {
			text-transform: capitalize;
		}
	}
}

.ext-articleguidance-error {
	margin-bottom: 16px;
}
</style>
