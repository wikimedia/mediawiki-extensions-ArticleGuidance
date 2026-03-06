<template>
	<div v-if="selectedOutline" class="ext-articleguidance-article-info">
		<h2 class="ext-articleguidance-article-title">
			{{ searchQuery }}
		</h2>
		<cdx-info-chip>
			{{ selectedOutline.label }}
		</cdx-info-chip>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxInfoChip } = require( '../codex.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );

module.exports = defineComponent( {
	name: 'ArticleInfo',
	components: {
		CdxInfoChip
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, searchQuery } = storeToRefs( store );

		return {
			selectedOutline,
			searchQuery
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-article-info {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 16px;

	.cdx-info-chip {
		border: 0;
	}
}

.ext-articleguidance-article-title {
	font-size: @font-size-xx-large;
	margin: 0;
	color: @color-base;
	border: 0;
	line-height: @line-height-xx-large;
}
</style>
