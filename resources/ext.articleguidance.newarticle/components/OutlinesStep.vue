<template>
	<step
		step-name="outlines"
		:title="$i18n( 'articleguidance-outlines-browse-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<p class="ext-articleguidance-outlines-subtitle">
			{{ $i18n( 'articleguidance-outlines-browse-subtitle', searchQuery ).text() }}
		</p>

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
				:thumbnail="outlineItem.thumbnail"
				@click="handleSelectOutline( outlineItem )"
			>
			</article-card>
		</div>
	</step>
</template>

<script>
const { defineComponent, onMounted } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxMessage } = require( '../codex.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const Step = require( './Step.vue' );
const ArticleCard = require( './ArticleCard.vue' );
const StateMessage = require( './StateMessage.vue' );

module.exports = defineComponent( {
	name: 'OutlinesStep',
	components: {
		CdxMessage,
		Step,
		ArticleCard,
		StateMessage
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { outlinesList, outlinesLoading: loading, outlinesError: error, searchQuery } =
			storeToRefs( store );

		onMounted( () => {
			store.loadOutlines();
		} );

		const handleSelectOutline = ( outlineItem ) => {
			store.selectOutline( outlineItem );
		};

		const handleBack = () => {
			store.goBack();
		};

		return {
			outlinesList,
			loading,
			error,
			searchQuery,
			handleSelectOutline,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlines-step {
	max-width: 800px;
	margin: 0 auto;
}

.ext-articleguidance-outlines-subtitle {
	margin: 4px 0 16px 0;
	font-weight: @font-weight-bold;
}

.ext-articleguidance-outlines-list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 16px;

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
