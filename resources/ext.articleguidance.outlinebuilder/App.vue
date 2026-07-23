<template>
	<div class="ext-articleguidance-outlinebuilder">
		<cdx-message
			v-if="showStatus"
			:type="status === 'empty' ? 'warning' : 'error'"
			inline
		>
			{{ statusText }}
		</cdx-message>

		<cdx-field
			class="ext-articleguidance-outlinebuilder__page"
			:status="pageError ? 'error' : 'default'"
			:messages="pageError ? { error: pageError } : {}"
		>
			<template #label>
				{{ $i18n( 'articleguidance-outlinebuilder-page-label' ).text() }}
			</template>
			<div class="ext-articleguidance-outlinebuilder__page-name">
				<span
					v-if="pagePrefix"
					class="ext-articleguidance-outlinebuilder__page-prefix"
				>{{ pagePrefix }}/</span>
				<cdx-text-input
					v-model="pageName"
					:disabled="creating"
				></cdx-text-input>
			</div>
		</cdx-field>

		<div class="ext-articleguidance-outlinebuilder__generate">
			<cdx-button
				action="progressive"
				weight="primary"
				:disabled="!pageReady || creating || ( !pending && selectedItems.size === 0 )"
				:aria-busy="waiting ? 'true' : null"
				@click="create"
			>
				{{ $i18n( 'articleguidance-outlinebuilder-create' ).text() }}
				<cdx-progress-indicator
					v-if="waiting"
					class="ext-articleguidance-outlinebuilder__button-progress"
					:aria-label="generatingLabel"
				></cdx-progress-indicator>
			</cdx-button>
			<cdx-button
				v-if="status === 'empty' || status === 'error'"
				:disabled="!pageReady || creating"
				@click="createEmpty"
			>
				{{ $i18n( 'articleguidance-outlinebuilder-create-empty' ).text() }}
			</cdx-button>
			<cdx-button
				class="ext-articleguidance-outlinebuilder__advanced-toggle"
				weight="quiet"
				:aria-expanded="showAdvanced ? 'true' : 'false'"
				aria-controls="ext-articleguidance-outlinebuilder-advanced"
				@click="showAdvanced = !showAdvanced"
			>
				<cdx-icon :icon="showAdvanced ? cdxIconCollapse : cdxIconExpand"></cdx-icon>
				{{ $i18n( 'articleguidance-outlinebuilder-advanced' ).text() }}
			</cdx-button>
		</div>
		<cdx-message v-if="createError" type="error">
			{{ createError }}
		</cdx-message>

		<div
			v-show="showAdvanced"
			id="ext-articleguidance-outlinebuilder-advanced"
			class="ext-articleguidance-outlinebuilder__advanced"
		>
			<p class="ext-articleguidance-outlinebuilder__intro">
				{{ $i18n( 'articleguidance-outlinebuilder-intro' ).text() }}
			</p>
			<add-articles
				:types="types"
				@add="onAdd"
			></add-articles>
			<section class="ext-articleguidance-outlinebuilder__list">
				<div class="ext-articleguidance-outlinebuilder__list-header">
					<h3>{{ listHeading }}</h3>
					<cdx-button
						v-if="articles.length > 0"
						weight="quiet"
						:disabled="creating"
						@click="onClear"
					>
						{{ $i18n( 'articleguidance-outlinebuilder-list-clear' ).text() }}
					</cdx-button>
				</div>
				<cdx-message
					v-if="addNotice"
					type="notice"
					inline
				>
					{{ addNotice }}
				</cdx-message>
				<p
					v-if="articles.length === 0"
					class="ext-articleguidance-outlinebuilder__list-empty"
				>
					{{ $i18n( 'articleguidance-outlinebuilder-list-empty' ).text() }}
				</p>
				<article-list
					v-else
					v-model:selected="selectedItems"
					:articles="articles"
					:outlier-reasons="outlierReasons"
				></article-list>
			</section>
		</div>
	</div>
</template>

<script>
const { computed, defineComponent, ref, watch } = require( 'vue' );
const {
	CdxButton,
	CdxField,
	CdxIcon,
	CdxMessage,
	CdxProgressIndicator,
	CdxTextInput
} = require( './codex.js' );
const { cdxIconCollapse, cdxIconExpand } = require( './icons.json' );
const AddArticles = require( './components/AddArticles.vue' );
const ArticleList = require( './components/ArticleList.vue' );
const { saveDraft } = require( './api/Outlines.js' );
const { findExamples, saveEmptyDraft } = require( './autoDraft.js' );
const { mergeArticles } = require( './articleList.js' );
const { findOutliers } = require( './outlierDetection.js' );
const { generateOutline } = require( './outlineGenerator.js' );

// Few strong examples make a good outline, and each one is a full page fetch
const EXAMPLE_COUNT = 10;
const PAGE_CHECK_DELAY = 300;

module.exports = defineComponent( {
	name: 'App',
	components: {
		AddArticles,
		ArticleList,
		CdxButton,
		CdxField,
		CdxIcon,
		CdxMessage,
		CdxProgressIndicator,
		CdxTextInput
	},
	props: {
		// Article types of the outline: { id, label, matchVia, hierarchyDepth }.
		// The first is the primary type. matchVia and hierarchyDepth are inferred
		// server-side from ArticleGuidanceMatchViaRules
		// (see SpecialOutlines::launchOutlineBuilder).
		types: {
			type: Array,
			required: true
		},
		// Outline pages are subpages of this prefix, so that the editor preloads the draft
		pagePrefix: {
			type: String,
			default: ''
		},
		// Free subpage name for the outline. Empty when no name is free.
		defaultPageName: {
			type: String,
			default: ''
		}
	},
	setup( props ) {
		const primary = props.types[ 0 ];
		const qIds = props.types.map( ( type ) => type.id );

		// The list of example articles, filled when the page loads and changed in the
		// advanced options. The outline is generated from the checked rows only.
		const articles = ref( [] );
		const selectedItems = ref( new Set() );
		// Map of item → outlier reason key. Recomputed over the whole list after
		// every change, so the reasons stay true to the current cohort.
		const outlierReasons = ref( {} );
		// Shown when an add brought nothing new (every article was already listed).
		const addNotice = ref( null );

		const listHeading = computed( () => mw.msg(
			'articleguidance-outlinebuilder-list-heading',
			selectedItems.value.size,
			articles.value.length
		) );
		const generatingLabel = mw.msg( 'articleguidance-outlinebuilder-generating' );

		const onAdd = ( { rows, source } ) => {
			const merged = mergeArticles( articles.value, rows, source );
			if ( merged.addedItems.length === 0 ) {
				// Finding nothing and finding only articles already listed are
				// different outcomes, and the maintainer's next move differs.
				addNotice.value = rows.length === 0 ?
					mw.msg( 'articleguidance-outlinebuilder-no-results' ) :
					mw.msg( 'articleguidance-outlinebuilder-add-none' );
				return;
			}
			articles.value = merged.articles;
			addNotice.value = null;
			// The generator unions the selected articles' sources and keeps sections
			// by frequency across them, so a thin article raises the bar for everyone
			// else's sections and a sprawling one floods the sources. Start the new
			// rows unchecked when they look unlike the cohort. Only the new rows are
			// touched: a maintainer's earlier decision is never overwritten.
			outlierReasons.value = findOutliers( articles.value );
			const selection = new Set( selectedItems.value );
			merged.addedItems.forEach( ( item ) => {
				if ( !outlierReasons.value[ item ] ) {
					selection.add( item );
				}
			} );
			selectedItems.value = selection;
		};
		const onClear = () => {
			articles.value = [];
			selectedItems.value = new Set();
			outlierReasons.value = {};
			addNotice.value = null;
		};

		// The outline page. The editor preloads the draft only on a new page.
		const pageName = ref( props.defaultPageName );
		const pageTitle = computed( () => {
			const name = pageName.value.trim();
			if ( name === '' ) {
				return null;
			}
			return mw.Title.newFromText( props.pagePrefix ? props.pagePrefix + '/' + name : name );
		} );
		// The default name is free, so it needs no check
		const pageExists = ref( false );
		const pageChecking = ref( false );
		let pageCheckTimer = null;
		let pageCheckId = 0;
		watch( pageTitle, ( title ) => {
			clearTimeout( pageCheckTimer );
			const id = ++pageCheckId;
			pageExists.value = false;
			pageChecking.value = title !== null;
			if ( title === null ) {
				return;
			}
			pageCheckTimer = setTimeout( () => {
				new mw.Api().get( {
					action: 'query',
					titles: title.getPrefixedText(),
					formatversion: 2
				} ).then( ( response ) => {
					if ( id === pageCheckId ) {
						pageExists.value = !response.query.pages[ 0 ].missing;
						pageChecking.value = false;
					}
				} ).catch( ( err ) => {
					mw.log.error( 'Outline builder: page check failed', err );
					// The editor shows an existing page, so the check is not required
					if ( id === pageCheckId ) {
						pageChecking.value = false;
					}
				} );
			}, PAGE_CHECK_DELAY );
		} );
		const pageError = computed( () => {
			if ( pageName.value.trim() !== '' && pageTitle.value === null ) {
				return mw.msg( 'articleguidance-outlinebuilder-page-invalid' );
			}
			return pageExists.value ? mw.msg( 'articleguidance-outlinebuilder-page-exists' ) : null;
		} );
		const pageReady = computed( () => pageTitle.value !== null &&
			!pageExists.value && !pageChecking.value );
		// OutlinePreloadHandler reads the types from the preload value. VisualEditor
		// sends preload to its API, but not other URL parameters.
		const goToEditor = () => {
			window.location.href = pageTitle.value.getUrl( {
				action: 'edit',
				preload: mw.Title.makeTitle( -1, 'Outlines/' + qIds.join( ',' ) ).getPrefixedText()
			} );
		};

		// One draft is kept, for the selection it was generated from. A change to
		// the selection makes the next create generate it again.
		const selectionKey = () => Array.from( selectedItems.value ).sort().join( '|' );
		let draftKey = null;
		let draftPromise = null;
		let draftDone = false;
		const ensureDraft = () => {
			const key = selectionKey();
			if ( draftPromise === null || draftKey !== key ) {
				const selected = articles.value.filter(
					( article ) => selectedItems.value.has( article.item )
				);
				draftKey = key;
				draftDone = false;
				draftPromise = generateOutline( qIds.join( ' ' ), primary.label, selected );
				draftPromise.then( () => {
					if ( draftKey === key ) {
						draftDone = true;
					}
				}, () => {
					if ( draftKey === key ) {
						draftKey = null;
						draftPromise = null;
					}
				} );
			}
			return draftPromise;
		};

		// The draft starts when the page loads, without a progress indicator, so it
		// is often ready when the maintainer has read the details and selects create.
		const status = ref( 'pending' );
		let autoCount = 0;
		const autoDraft = findExamples( props.types, EXAMPLE_COUNT )
			.then( ( rows ) => {
				onAdd( { rows: rows, source: { key: 'type', name: '' } } );
				autoCount = articles.value.length;
				// The empty result is shown in the status, not in the list
				addNotice.value = null;
				if ( selectedItems.value.size === 0 ) {
					status.value = 'empty';
					return;
				}
				return ensureDraft().then( () => {
					status.value = 'ready';
				} );
			} )
			.catch( ( err ) => {
				mw.log.error( 'Outline builder: automatic draft failed', err );
				status.value = 'error';
			} );

		const pending = computed( () => status.value === 'pending' );
		// Choosing example articles is optional, unless no draft could be made
		const showAdvanced = ref( false );
		watch( status, ( value ) => {
			if ( value === 'empty' || value === 'error' ) {
				showAdvanced.value = true;
			}
		} );
		// The message asks for example articles, so it goes away when the maintainer adds some
		const showStatus = computed( () => ( status.value === 'empty' || status.value === 'error' ) &&
			articles.value.length === autoCount );
		const statusText = computed( () => status.value === 'empty' ?
			mw.msg( 'articleguidance-outlinebuilder-status-no-results' ) :
			mw.msg( 'articleguidance-outlinebuilder-status-error' )
		);

		const creating = ref( false );
		// The create button shows a progress indicator only while the draft is not ready
		const waiting = ref( false );
		const createError = ref( null );
		// The browser can keep the page in its cache for the back button. Reset at
		// the last moment, so the progress shows until the editor loads, and the
		// cached page is not busy.
		window.addEventListener( 'pagehide', () => {
			creating.value = false;
			waiting.value = false;
		} );

		// The draft is kept on the server, and the editor preloads it on the new page
		const create = async () => {
			creating.value = true;
			waiting.value = !( draftDone && draftKey === selectionKey() );
			createError.value = null;
			try {
				await autoDraft;
				if ( selectedItems.value.size === 0 ) {
					creating.value = false;
					waiting.value = false;
					return;
				}
				await saveDraft( qIds, await ensureDraft() );
				// The progress indicator stays until the editor loads
				goToEditor();
			} catch ( err ) {
				createError.value = mw.msg( 'articleguidance-outlinebuilder-outline-error' );
				mw.log.error( 'Outline builder: draft failed', err );
				creating.value = false;
				waiting.value = false;
			}
		};
		const createEmpty = async () => {
			creating.value = true;
			createError.value = null;
			try {
				await saveEmptyDraft( qIds );
				goToEditor();
			} catch ( err ) {
				createError.value = mw.msg( 'articleguidance-outlinebuilder-empty-error' );
				mw.log.error( 'Outline builder: empty draft failed', err );
				creating.value = false;
			}
		};

		return {
			articles,
			selectedItems,
			outlierReasons,
			addNotice,
			listHeading,
			generatingLabel,
			onAdd,
			onClear,
			pageName,
			pageError,
			pageReady,
			status,
			pending,
			showAdvanced,
			showStatus,
			statusText,
			creating,
			waiting,
			createError,
			create,
			createEmpty,
			cdxIconCollapse,
			cdxIconExpand
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-outlinebuilder__intro {
	max-width: 42em;
	color: @color-subtle;
}

.ext-articleguidance-outlinebuilder__advanced {
	margin-top: @spacing-150;
}

.ext-articleguidance-outlinebuilder__page {
	max-width: 42em;
}

// The prefix is fixed, so it is text in front of the field for the subpage name
.ext-articleguidance-outlinebuilder__page-name {
	display: flex;
	flex-wrap: wrap;
	align-items: center;

	.cdx-text-input {
		flex: 1;
		min-width: 0;
	}
}

.ext-articleguidance-outlinebuilder__page-prefix {
	margin-right: @spacing-25;
	color: @color-subtle;
	white-space: nowrap;
}

.ext-articleguidance-outlinebuilder__advanced-toggle {
	margin-left: auto;
}

.ext-articleguidance-outlinebuilder__list {
	margin-top: @spacing-150;

	&-header {
		display: flex;
		flex-wrap: wrap;
		gap: @spacing-50;
		align-items: baseline;
		justify-content: space-between;

		h3 {
			margin: 0;
		}
	}

	&-empty {
		color: @color-subtle;
	}
}

// Same width as the type cards, so the quiet toggle lines up with their right edge
.ext-articleguidance-outlinebuilder__generate {
	display: flex;
	flex-wrap: wrap;
	gap: @spacing-75;
	align-items: center;
	margin-top: @spacing-100;
	max-width: 42em;
}

// Fits the progress indicator in the button, next to the label
.ext-articleguidance-outlinebuilder__button-progress .cdx-progress-indicator__indicator {
	width: @size-icon-small;
	min-width: @size-icon-small;
	height: @size-icon-small;
	min-height: @size-icon-small;
}
</style>
