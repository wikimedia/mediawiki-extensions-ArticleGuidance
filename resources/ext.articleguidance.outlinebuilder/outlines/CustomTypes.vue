<template>
	<div class="ext-articleguidance-outlines-custom">
		<cdx-field>
			<template #label>
				{{ $i18n( 'articleguidance-outlines-custom-label' ).text() }}
			</template>
			<template #help-text>
				{{ helpText }}
			</template>
			<cdx-multiselect-lookup
				v-model:input-chips="chips"
				v-model:selected="selected"
				v-model:input-value="inputValue"
				:menu-items="menuItems"
				:menu-config="menuConfig"
				:placeholder="$i18n( 'articleguidance-outlines-custom-placeholder' ).text()"
				@input="onInput"
			>
				<template #no-results>
					{{ $i18n( 'articleguidance-outlines-custom-no-results' ).text() }}
				</template>
			</cdx-multiselect-lookup>
		</cdx-field>
		<cdx-button
			class="ext-articleguidance-outlines-custom__continue"
			action="progressive"
			weight="primary"
			:disabled="chips.length === 0"
			@click="onContinue"
		>
			{{ $i18n( 'articleguidance-outlines-custom-continue' ).text() }}
		</cdx-button>
	</div>
</template>

<script>
const { computed, defineComponent, ref } = require( 'vue' );
const { CdxButton, CdxField, CdxMultiselectLookup } = require( '../codex.js' );
const { fetchOutlines } = require( 'ext.articleguidance.common' );
const { searchItems } = require( '../api/Wikidata.js' );

// The article-type attribute takes at most this many Q IDs (OutlineService::MAX_ARTICLE_TYPES)
const MAX_TYPES = 10;
const SEARCH_DELAY = 250;
const SEARCH_LIMIT = 10;

module.exports = defineComponent( {
	name: 'CustomTypes',
	components: { CdxButton, CdxField, CdxMultiselectLookup },
	props: {
		language: {
			type: String,
			required: true
		}
	},
	emits: [ 'continue' ],
	setup( props, { emit } ) {
		const chips = ref( [] );
		const selected = ref( [] );
		const inputValue = ref( '' );
		const results = ref( [] );
		const menuConfig = { visibleItemCount: 6 };

		// Label of the outline that covers each Q ID, so a search result can say so
		const getCovered = () => fetchOutlines().then( ( outlines ) => {
			const covered = {};
			outlines.forEach( ( outline ) => {
				outline.articleTypes.forEach( ( typeEntry ) => {
					covered[ typeEntry.id ] = outline.label;
				} );
			} );
			return covered;
		} );

		const menuItems = computed( () => chips.value.length >= MAX_TYPES ? [] : results.value );
		const helpText = computed( () => chips.value.length >= MAX_TYPES ?
			mw.msg( 'articleguidance-outlines-custom-max', MAX_TYPES ) :
			mw.msg( 'articleguidance-outlines-custom-help' )
		);

		let timer = null;
		// Each search replaces the previous one, so a slow response cannot overwrite a newer one
		let searchId = 0;
		const onInput = ( value ) => {
			clearTimeout( timer );
			const id = ++searchId;
			if ( !value || !value.trim() ) {
				results.value = [];
				return;
			}
			timer = setTimeout( () => {
				const search = searchItems( value.trim(), props.language, SEARCH_LIMIT );
				Promise.all( [ search, getCovered() ] )
					.then( ( [ items, covered ] ) => {
						if ( id !== searchId ) {
							return;
						}
						results.value = items.map( ( item ) => {
							// A type that has an outline already would make a duplicate outline
							const coveredBy = covered[ item.id ];
							return {
								value: item.id,
								label: item.label,
								description: coveredBy ?
									mw.msg( 'articleguidance-outlines-custom-covered', coveredBy ) :
									item.description,
								disabled: Boolean( coveredBy )
							};
						} );
					} )
					.catch( ( err ) => {
						mw.log.error( 'Outlines: type search failed', err );
						if ( id === searchId ) {
							results.value = [];
						}
					} );
			}, SEARCH_DELAY );
		};

		const onContinue = () => {
			emit( 'continue', chips.value.map( ( chip ) => chip.value ) );
		};

		return {
			chips,
			selected,
			inputValue,
			menuItems,
			menuConfig,
			helpText,
			onInput,
			onContinue
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlines-custom {
	max-width: 42em;

	&__continue {
		margin-top: @spacing-75;
	}
}
</style>
