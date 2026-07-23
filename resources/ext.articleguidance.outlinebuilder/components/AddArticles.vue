<template>
	<div class="ext-articleguidance-outlinebuilder__add">
		<cdx-tabs v-model:active="activeTab" :framed="true">
			<cdx-tab
				name="type"
				:label="$i18n( 'articleguidance-outlinebuilder-tab-type' ).text()"
			>
				<p class="ext-articleguidance-outlinebuilder__tab-description">
					{{ typeDescription }}
				</p>
				<div class="ext-articleguidance-outlinebuilder__row">
					<cdx-field>
						<template #label>
							{{ countLabel }}
						</template>
						<cdx-text-input
							v-model="typeCount"
							input-type="number"
							min="1"
							:max="maxCount"
							:disabled="busy"
						></cdx-text-input>
					</cdx-field>
					<cdx-button
						action="progressive"
						weight="primary"
						:disabled="busy"
						@click="onFindByType"
					>
						{{ $i18n( 'articleguidance-outlinebuilder-type-find' ).text() }}
					</cdx-button>
				</div>
			</cdx-tab>

			<cdx-tab
				name="category"
				:label="$i18n( 'articleguidance-outlinebuilder-tab-category' ).text()"
			>
				<p class="ext-articleguidance-outlinebuilder__tab-description">
					{{ $i18n( 'articleguidance-outlinebuilder-category-description' ).text() }}
				</p>
				<div class="ext-articleguidance-outlinebuilder__row">
					<cdx-field class="ext-articleguidance-outlinebuilder__lookup">
						<template #label>
							{{ $i18n( 'articleguidance-outlinebuilder-category-label' ).text() }}
						</template>
						<cdx-lookup
							ref="categoryLookupRef"
							v-model:selected="categorySelection"
							v-model:input-value="categoryInput"
							:menu-items="categoryItems"
							:placeholder="categoryPlaceholder"
							:disabled="busy"
							@input="onCategoryInput"
						>
							<template #no-results>
								{{ categoryNoResults }}
							</template>
						</cdx-lookup>
					</cdx-field>
					<cdx-field>
						<template #label>
							{{ countLabel }}
						</template>
						<cdx-text-input
							v-model="categoryCount"
							input-type="number"
							min="1"
							:max="maxCount"
							:disabled="busy"
						></cdx-text-input>
					</cdx-field>
				</div>
				<cdx-checkbox v-model="includeSubcategories" :disabled="busy">
					{{ $i18n( 'articleguidance-outlinebuilder-category-subcats' ).text() }}
				</cdx-checkbox>
				<cdx-button
					class="ext-articleguidance-outlinebuilder__submit"
					action="progressive"
					weight="primary"
					:disabled="busy || !categorySelection"
					@click="onAddCategory"
				>
					{{ $i18n( 'articleguidance-outlinebuilder-category-add' ).text() }}
				</cdx-button>
			</cdx-tab>

			<cdx-tab
				name="title"
				:label="$i18n( 'articleguidance-outlinebuilder-tab-title' ).text()"
			>
				<p class="ext-articleguidance-outlinebuilder__tab-description">
					{{ $i18n( 'articleguidance-outlinebuilder-title-description' ).text() }}
				</p>
				<cdx-field class="ext-articleguidance-outlinebuilder__lookup">
					<template #label>
						{{ $i18n( 'articleguidance-outlinebuilder-add-label' ).text() }}
					</template>
					<cdx-lookup
						ref="titleLookupRef"
						v-model:selected="titleSelection"
						v-model:input-value="titleInput"
						:menu-items="titleItems"
						:placeholder="titlePlaceholder"
						:disabled="busy"
						@input="onTitleInput"
						@update:selected="onTitleSelected"
					>
						<template #no-results>
							{{ $i18n( 'articleguidance-outlinebuilder-add-no-results' ).text() }}
						</template>
					</cdx-lookup>
				</cdx-field>
			</cdx-tab>
		</cdx-tabs>

		<div v-if="busy" class="ext-articleguidance-outlinebuilder__busy">
			<cdx-progress-indicator :aria-label="busyLabel"></cdx-progress-indicator>
			<span>{{ busyLabel }}</span>
		</div>
		<cdx-message
			v-else-if="error"
			type="error"
			inline
		>
			{{ error }}
		</cdx-message>
	</div>
</template>

<script>
const { computed, defineComponent, ref, watch } = require( 'vue' );
const {
	CdxButton,
	CdxCheckbox,
	CdxField,
	CdxLookup,
	CdxMessage,
	CdxProgressIndicator,
	CdxTab,
	CdxTabs,
	CdxTextInput
} = require( '../codex.js' );
const { findExamples } = require( '../autoDraft.js' );
const {
	findArticlesInCategory,
	fetchArticlesByTitles
} = require( '../articleFinder.js' );
const { searchArticles, searchCategories } = require( '../api/Wikipedia.js' );

const DEFAULT_COUNT = 25;
// The anonymous search API returns at most 50 results per query, so asking for
// more than that returns 50 either way. Cap the field so every add option
// honours the number the maintainer typed.
const MAX_COUNT = 50;
const LOOKUP_LIMIT = 10;
const LOOKUP_DELAY_MS = 200;

/**
 * Read a count field, falling back to the default when it is blank or not a
 * positive number, and capping it at what the API can return.
 *
 * @param {string} value
 * @return {number}
 */
function toCount( value ) {
	return Math.min( MAX_COUNT, Math.max( 1, parseInt( value, 10 ) || DEFAULT_COUNT ) );
}

module.exports = defineComponent( {
	name: 'AddArticles',
	components: {
		CdxButton,
		CdxCheckbox,
		CdxField,
		CdxLookup,
		CdxMessage,
		CdxProgressIndicator,
		CdxTab,
		CdxTabs,
		CdxTextInput
	},
	props: {
		// Article types of the outline: { id, label, matchVia, hierarchyDepth }
		types: {
			type: Array,
			required: true
		}
	},
	emits: [ 'add' ],
	setup( props, { emit } ) {
		const activeTab = ref( 'type' );
		const busy = ref( false );
		const busyLabel = ref( '' );
		const error = ref( null );

		// The error sits below the tab strip, so it would otherwise stay on screen
		// while the maintainer works in a different tab.
		watch( activeTab, () => {
			error.value = null;
		} );

		const countLabel = mw.msg( 'articleguidance-outlinebuilder-count-label', MAX_COUNT );

		const typeDescription = computed( () => mw.msg(
			'articleguidance-outlinebuilder-type-description',
			mw.language.listToText( props.types.map( ( type ) => type.label || type.id ) ),
			mw.language.listToText( props.types.map( ( type ) => type.id ) )
		) );

		/**
		 * Run one add action: flip the busy state, collect the rows, and hand them
		 * to the parent with their provenance. Every tab funnels through here so
		 * the busy and error handling stay in one place.
		 *
		 * @param {Function} collect Returns a promise of result rows
		 * @param {string} label Progress label
		 * @param {Object} source Provenance to stamp on the rows
		 * @return {Promise<boolean>} Whether the rows were collected
		 */
		const runAdd = async ( collect, label, source ) => {
			busy.value = true;
			busyLabel.value = label;
			error.value = null;
			let rows;
			try {
				rows = await collect();
			} catch ( err ) {
				error.value = mw.msg( 'articleguidance-outlinebuilder-add-error' );
				mw.log.error( 'Outline builder: add failed', err );
				return false;
			} finally {
				busy.value = false;
			}
			// Emitted outside the fetch try/catch so a failure in the parent's
			// handler is not reported as a failure to fetch the articles. Callers
			// do not handle a rejection, so the throw is caught here rather than
			// left as an unhandled rejection.
			try {
				emit( 'add', { rows: rows, source: source } );
			} catch ( err ) {
				mw.log.error( 'Outline builder: adding the articles failed', err );
			}
			return true;
		};

		/**
		 * Debounce a lookup and drop responses from superseded requests. Each
		 * lookup gets its own closure, so the two on this panel cannot interfere.
		 *
		 * @param {Function} search Takes a term, returns a promise of titles
		 * @param {Object} items Ref holding the menu items
		 * @return {Function} Input handler
		 */
		const makeLookupHandler = ( search, items ) => {
			let seq = 0;
			let timer = null;
			return ( value ) => {
				if ( timer ) {
					clearTimeout( timer );
				}
				// Bump the sequence first: clearing the field must also retire any
				// request already in flight, or its response repopulates the menu
				// for text that is no longer there.
				const current = ++seq;
				const term = ( value || '' ).trim();
				if ( term === '' ) {
					items.value = [];
					return;
				}
				timer = setTimeout( () => {
					search( term ).then( ( titles ) => {
						if ( current === seq ) {
							items.value = titles.map(
								( title ) => ( { value: title, label: title } )
							);
						}
					} ).catch( () => {
						if ( current === seq ) {
							items.value = [];
						}
					} );
				}, LOOKUP_DELAY_MS );
			};
		};

		// Tab 1: the type search, the same search that the page runs when it loads.
		// The articles that are already listed are skipped, so a larger count adds more.
		const typeCount = ref( String( DEFAULT_COUNT ) );
		const onFindByType = () => runAdd(
			() => findExamples( props.types, toCount( typeCount.value ) ),
			mw.msg( 'articleguidance-outlinebuilder-busy-type' ),
			{ key: 'type', name: '' }
		);

		// Tab 2: a wiki category.
		const categoryLookupRef = ref( null );
		const categorySelection = ref( null );
		const categoryItems = ref( [] );
		const categoryInput = ref( '' );
		const categoryCount = ref( String( DEFAULT_COUNT ) );
		const includeSubcategories = ref( false );
		const categoryPlaceholder = mw.msg( 'articleguidance-outlinebuilder-category-placeholder' );
		const categoryNoResults = mw.msg( 'articleguidance-outlinebuilder-category-no-results' );
		const onCategoryInput = makeLookupHandler(
			( term ) => searchCategories( term, LOOKUP_LIMIT ),
			categoryItems
		);

		const onAddCategory = () => {
			const category = categorySelection.value;
			if ( !category ) {
				return;
			}
			runAdd(
				() => findArticlesInCategory(
					category,
					toCount( categoryCount.value ),
					includeSubcategories.value
				),
				mw.msg( 'articleguidance-outlinebuilder-busy-category' ),
				// Strip the namespace prefix so the source column stays short.
				{ key: 'category', name: category.replace( /^[^:]+:/, '' ) }
			).then( ( added ) => {
				// After a failure, keep the selection so the maintainer can try again
				if ( !added ) {
					return;
				}
				// The count and the subcategory checkbox are kept: they are settings
				// the maintainer is likely to reuse for the next category. Focus goes
				// back to the field because the cleared selection disables the button
				// that currently holds it.
				categorySelection.value = null;
				categoryItems.value = [];
				categoryInput.value = '';
				categoryLookupRef.value.focus();
			} );
		};

		// Tab 3: a single article, by title.
		const titleLookupRef = ref( null );
		const titleSelection = ref( null );
		const titleItems = ref( [] );
		const titleInput = ref( '' );
		const titlePlaceholder = mw.msg( 'articleguidance-outlinebuilder-add-placeholder' );
		const onTitleInput = makeLookupHandler(
			( term ) => searchArticles( term, LOOKUP_LIMIT ),
			titleItems
		);

		const onTitleSelected = ( value ) => {
			if ( !value ) {
				return;
			}
			runAdd(
				() => fetchArticlesByTitles( [ value ] ),
				mw.msg( 'articleguidance-outlinebuilder-busy-title' ),
				{ key: 'manual', name: '' }
			).then( ( added ) => {
				if ( !added ) {
					return;
				}
				titleSelection.value = null;
				titleItems.value = [];
				titleInput.value = '';
				titleLookupRef.value.focus();
			} );
		};

		return {
			activeTab,
			busy,
			busyLabel,
			error,
			maxCount: MAX_COUNT,
			countLabel,
			typeDescription,
			typeCount,
			onFindByType,
			categoryLookupRef,
			categoryInput,
			categorySelection,
			categoryItems,
			categoryCount,
			categoryPlaceholder,
			categoryNoResults,
			includeSubcategories,
			onCategoryInput,
			onAddCategory,
			titleLookupRef,
			titleInput,
			titleSelection,
			titleItems,
			titlePlaceholder,
			onTitleInput,
			onTitleSelected
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlinebuilder__tab-description {
	max-width: 42em;
	margin: 0 0 @spacing-75;
	color: @color-subtle;
}

.ext-articleguidance-outlinebuilder__row {
	display: flex;
	flex-wrap: wrap;
	gap: @spacing-75;
	align-items: flex-end;

	// Codex fields are full-width blocks by default, which would force each
	// control onto its own line. Size them to content so the row stays inline
	// (still wrapping on narrow/mobile viewports).
	.cdx-field {
		flex: 0 0 auto;
		margin-top: 0;
	}
}

.ext-articleguidance-outlinebuilder__lookup {
	flex: 1 1 20em;
	max-width: 28em;
}

.ext-articleguidance-outlinebuilder__submit {
	display: block;
	margin-top: @spacing-75;
}

.ext-articleguidance-outlinebuilder__busy {
	display: flex;
	align-items: center;
	gap: @spacing-50;
	margin-top: @spacing-75;
	color: @color-subtle;
}
</style>
