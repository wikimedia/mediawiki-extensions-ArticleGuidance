<template>
	<cdx-table
		v-model:selected-rows="selectedRows"
		class="ext-articleguidance-outlinebuilder__results"
		:caption="caption"
		:hide-caption="true"
		:columns="columns"
		:data="tableData"
		:use-row-selection="true"
	>
		<template #item-title="{ row }">
			<a
				:href="row.url"
				target="_blank"
				rel="noopener">
				{{ row.title }}
			</a>
			<span
				v-if="outlierLabel( row.item )"
				class="ext-articleguidance-outlinebuilder__outlier"
			>
				{{ outlierLabel( row.item ) }}
			</span>
		</template>
		<template #item-size="{ item }">
			{{ formatSize( item ) }}
		</template>
		<template #item-sections="{ item }">
			{{ formatCount( item ) }}
		</template>
		<template #item-references="{ item }">
			{{ formatCount( item ) }}
		</template>
		<template #item-updated="{ item }">
			{{ formatDate( item ) }}
		</template>
		<template #item-quality="{ item }">
			{{ qualityLabel( item ) }}
		</template>
		<template #item-source="{ item }">
			{{ sourceLabel( item ) }}
		</template>
	</cdx-table>
</template>

<script>
const { computed, defineComponent } = require( 'vue' );
const { CdxTable } = require( '../codex.js' );

module.exports = defineComponent( {
	name: 'ArticleList',
	components: { CdxTable },
	props: {
		articles: {
			type: Array,
			required: true
		},
		// Item values of the rows that feed the outline.
		selected: {
			type: Set,
			required: true
		},
		// Map of item → outlier reason key, for rows that look unlike the cohort.
		outlierReasons: {
			type: Object,
			required: true
		}
	},
	emits: [ 'update:selected' ],
	setup( props, { emit } ) {
		// The table selects rows by index, and the parent by item
		const selectedRows = computed( {
			get: () => props.articles.reduce( ( rows, article, index ) => (
				props.selected.has( article.item ) ? rows.concat( index ) : rows
			), [] ),
			set: ( rows ) => emit(
				'update:selected',
				new Set( rows.map( ( index ) => props.articles[ index ].item ) )
			)
		} );

		// ResourceLoader lowercases the slot names, so the column IDs are lowercase
		const tableData = computed( () => props.articles.map(
			( article ) => Object.assign( {}, article, {
				size: article.sizeBytes,
				updated: article.lastUpdated
			} )
		) );

		const caption = mw.msg( 'articleguidance-outlinebuilder-list-heading' );
		const columns = [
			{ id: 'title', label: mw.msg( 'articleguidance-outlinebuilder-col-title' ) },
			{ id: 'size', label: mw.msg( 'articleguidance-outlinebuilder-col-size' ) },
			{ id: 'sections', label: mw.msg( 'articleguidance-outlinebuilder-col-sections' ) },
			{ id: 'references', label: mw.msg( 'articleguidance-outlinebuilder-col-references' ) },
			{ id: 'updated', label: mw.msg( 'articleguidance-outlinebuilder-col-updated' ) },
			{ id: 'quality', label: mw.msg( 'articleguidance-outlinebuilder-col-quality' ) },
			{ id: 'source', label: mw.msg( 'articleguidance-outlinebuilder-col-source' ) }
		];

		const outlierLabel = ( item ) => {
			const reason = props.outlierReasons[ item ];
			if ( !reason ) {
				return '';
			}
			// Messages that can be used here:
			// * articleguidance-outlinebuilder-outlier-sections-low
			// * articleguidance-outlinebuilder-outlier-sections-high
			// * articleguidance-outlinebuilder-outlier-size
			return mw.msg( 'articleguidance-outlinebuilder-outlier-' + reason );
		};

		const sourceLabel = ( source ) => {
			if ( !source ) {
				return '';
			}
			if ( source.key === 'category' ) {
				return mw.msg( 'articleguidance-outlinebuilder-source-category', source.name );
			}
			// Messages that can be used here:
			// * articleguidance-outlinebuilder-source-type
			// * articleguidance-outlinebuilder-source-manual
			return mw.msg( 'articleguidance-outlinebuilder-source-' + source.key );
		};

		const formatSize = ( bytes ) => {
			if ( bytes === null || bytes === undefined ) {
				return '';
			}
			const kb = Math.max( 1, Math.round( bytes / 1024 ) );
			return mw.msg( 'articleguidance-outlinebuilder-size-kb', kb );
		};

		const formatCount = ( count ) => ( count === null || count === undefined ? '' : count );

		const formatDate = ( timestamp ) => {
			if ( !timestamp ) {
				return '';
			}
			const date = new Date( timestamp );
			return isNaN( date.getTime() ) ? '' : date.toLocaleDateString();
		};

		const qualityLabel = ( quality ) => {
			if ( quality === 'featured' ) {
				return mw.msg( 'articleguidance-outlinebuilder-quality-featured' );
			}
			if ( quality === 'good' ) {
				return mw.msg( 'articleguidance-outlinebuilder-quality-good' );
			}
			return '';
		};

		return {
			selectedRows,
			tableData,
			caption,
			columns,
			outlierLabel,
			sourceLabel,
			formatSize,
			formatCount,
			formatDate,
			qualityLabel
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlinebuilder__outlier {
	display: block;
	color: @color-subtle;
}
</style>
