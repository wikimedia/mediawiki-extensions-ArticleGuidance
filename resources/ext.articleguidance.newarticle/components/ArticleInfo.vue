<template>
	<div v-if="selectedOutline" class="ext-articleguidance-article-info">
		<h2 class="ext-articleguidance-article-title">
			{{ creationTitle }}
		</h2>
		<cdx-button
			weight="quiet"
			class="ext-articleguidance-article-info-edit"
			:aria-label="$i18n( 'articleguidance-updatetitle-edit-label' ).text()"
			@click="handleEditTitle"
		>
			<cdx-icon :icon="cdxIconEdit"></cdx-icon>
		</cdx-button>
		<cdx-info-chip>
			{{ selectedOutline.label }}
		</cdx-info-chip>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { storeToRefs } = require( 'pinia' );
const { CdxInfoChip, CdxButton, CdxIcon } = require( '../codex.js' );
const { cdxIconEdit } = require( '../icons.json' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );

module.exports = defineComponent( {
	name: 'ArticleInfo',
	components: {
		CdxInfoChip,
		CdxButton,
		CdxIcon
	},
	setup() {
		const store = useArticleGuidanceStore();
		const { selectedOutline, creationTitle } = storeToRefs( store );

		const handleEditTitle = () => {
			store.goToUpdateTitle();
		};

		return {
			selectedOutline,
			creationTitle,
			handleEditTitle,
			cdxIconEdit
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
