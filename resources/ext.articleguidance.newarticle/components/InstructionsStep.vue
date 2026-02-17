<template>
	<step
		step-name="instructions"
		:title="$i18n( 'articleguidance-instructions-title' ).text()"
		:show-back="true"
		@back="handleBack"
	>
		<p class="ext-articleguidance-instructions-subtitle">
			{{ $i18n( 'articleguidance-instructions-subtitle', articleTitle ).text() }}
		</p>

		<!-- Article guidance instructions -->
		<div v-if="outline.instructions" class="ext-articleguidance-instructions-content">
			<!-- eslint-disable-next-line vue/no-v-html -->
			<div v-html="outline.instructions"></div>
		</div>

		<!-- Actions -->
		<div class="ext-articleguidance-instructions-actions">
			<cdx-button
				weight="primary"
				action="progressive"
				@click="handleStartWriting"
			>
				{{ $i18n( 'articleguidance-instructions-start-writing' ).text() }}
			</cdx-button>
		</div>
	</step>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { CdxButton } = require( '../codex.js' );
const Step = require( './Step.vue' );

module.exports = defineComponent( {
	name: 'InstructionsStep',
	components: {
		CdxButton,
		Step
	},
	props: {
		outline: {
			type: Object,
			required: true
		},
		articleTitle: {
			type: String,
			required: true
		},
		references: {
			type: Array,
			default: () => []
		}
	},
	emits: [ 'back' ],
	setup( props, { emit } ) {
		// Generate URL for creating an article with the selected outline as preload
		// Uses the article title as entered by the user in the text input
		const getCreateArticleUrl = () => {
			const preloadParams = [];

			// Add references as preload parameters
			const validRefs = props.references.filter( ( r ) => r.trim() !== '' );
			validRefs.forEach( ( r ) => {
				preloadParams.push( `* ${ r }` );
			} );

			const params = {
				veaction: 'edit',
				preload: props.outline.title,
				preloadparams: [ preloadParams.join( '\n\n' ) ]
			};

			return mw.util.getUrl( props.articleTitle, params );
		};

		// Navigate to article creation page
		const handleStartWriting = () => {
			const url = getCreateArticleUrl();
			window.location.href = url;
		};

		// Handle back navigation
		const handleBack = () => {
			emit( 'back' );
		};

		return {
			handleStartWriting,
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-instructions-step {
	max-width: 900px;
	margin: 0 auto;
}

.ext-articleguidance-instructions-subtitle {
	font-weight: @font-weight-bold;
	margin: 0 0 24px 0;
}

.ext-articleguidance-instructions-content {
	margin-bottom: 24px;
	padding: 16px;
	background-color: @background-color-neutral-subtle;
	border-left: 3px solid @color-progressive;
	border-radius: 2px;
}

.ext-articleguidance-sections-list-wrapper {
	margin-bottom: 24px;

	h3 {
		font-size: 20px;
		font-weight: 600;
		margin-bottom: 16px;
		color: @color-base;
	}
}

.ext-articleguidance-sections-list {
	list-style: none;
	padding: 0;
	margin: 0;
}

.ext-articleguidance-section-item {
	padding: 12px 16px;
	background-color: @background-color-neutral-subtle;
	border-left: 3px solid @color-progressive;
	margin-bottom: 8px;
	font-weight: 500;

	&:last-child {
		margin-bottom: 0;
	}
}

.ext-articleguidance-instructions-actions {
	display: flex;
	justify-content: flex-end;
	margin-top: 32px;
	padding-top: 24px;
	border-top: 1px solid @border-color-subtle;
}
</style>
