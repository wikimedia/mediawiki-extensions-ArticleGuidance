<template>
	<div class="ext-articleguidance-step-header">
		<div class="ext-articleguidance-step-header-back">
			<cdx-button
				v-if="showBack"
				weight="quiet"
				:aria-label="$i18n( 'articleguidance-navigation-back' ).text()"
				@click="handleBack"
			>
				<cdx-icon :icon="cdxIconArrowPrevious"></cdx-icon>
			</cdx-button>
		</div>
		<h1 class="ext-articleguidance-step-header-title">
			{{ title }}
		</h1>
		<div class="ext-articleguidance-step-header-spacer"></div>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const { CdxButton, CdxIcon } = require( '../codex.js' );
const { cdxIconArrowPrevious } = require( '../icons.json' );

module.exports = defineComponent( {
	name: 'StepHeader',
	components: {
		CdxButton,
		CdxIcon
	},
	props: {
		title: {
			type: String,
			required: true
		},
		showBack: {
			type: Boolean,
			default: false
		}
	},
	emits: [ 'back' ],
	setup( props, { emit } ) {
		const handleBack = () => {
			emit( 'back' );
		};

		return {
			handleBack,
			cdxIconArrowPrevious
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-step-header {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	padding: 8px 0;
	border-bottom: 1px solid @border-color-subtle;
}

.ext-articleguidance-step-header-back {
	padding: 0 8px;
}

.ext-articleguidance-step-header-title {
	justify-self: center;
	font-size: 1em;
	font-weight: @font-weight-bold;
	margin: 0;
	color: @color-base;
	text-align: center;
	border: 0;
}

.ext-articleguidance-step-header-spacer {
	justify-self: end;
}
</style>
