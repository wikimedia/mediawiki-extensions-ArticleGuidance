<template>
	<step
		step-name="outlines"
		:title="$i18n( 'articleguidance-outlines-browse-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<p class="ext-articleguidance-outlines-subtitle">
			{{ $i18n( 'articleguidance-outlines-browse-subtitle', articleTitle ).text() }}
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
		<div v-if="!loading && allOutlines.length > 0" class="ext-articleguidance-outlines-list">
			<article-card
				v-for="outlineItem in allOutlines"
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
const { defineComponent, ref, onMounted } = require( 'vue' );
const { CdxMessage } = require( '../codex.js' );
const { useOutlines } = require( '../composables/useOutlines.js' );
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
	props: {
		articleTitle: {
			type: String,
			default: ''
		}
	},
	emits: [ 'select-outline', 'back' ],
	setup( props, { emit } ) {
		const allOutlines = ref( [] );
		const loading = ref( true );
		const error = ref( null );

		const { getOutlines } = useOutlines();

		onMounted( async () => {
			try {
				const outlines = await getOutlines();
				allOutlines.value = outlines;
			} catch ( err ) {
				error.value = err.message || 'Failed to load outlines';
			} finally {
				loading.value = false;
			}
		} );

		const handleSelectOutline = ( outlineItem ) => {
			emit( 'select-outline', outlineItem );
		};

		const handleBack = () => {
			emit( 'back' );
		};

		return {
			allOutlines,
			loading,
			error,
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
