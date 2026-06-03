<template>
	<div
		:class="'ext-articleguidance-' + stepName + '-step'"
	>
		<step-header
			:title="title"
			:show-back="showBack"
			@back="handleBack"
		>
		</step-header>
		<div class="ext-articleguidance-step-body">
			<div class="ext-articleguidance-step-content">
				<slot></slot>
			</div>
		</div>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );
const StepHeader = require( './StepHeader.vue' );

module.exports = defineComponent( {
	name: 'StepWrapper',
	components: {
		StepHeader
	},
	props: {
		title: {
			type: String,
			required: true
		},
		showBack: {
			type: Boolean,
			default: false
		},
		stepName: {
			type: String,
			required: true
		}
	},
	emits: [ 'back' ],
	setup( props, { emit } ) {
		const handleBack = () => {
			emit( 'back' );
		};

		return {
			handleBack
		};
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-step-body {
	padding: clamp( 16px, 2vw, 24px ) clamp( 16px, 3vw, 32px ) clamp( 16px, 3vw, 32px );
}

.ext-articleguidance-step-header-inner,
.ext-articleguidance-step-content {
	max-width: 40rem;
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		.ext-articleguidance-step-body {
			padding: 12px 0 0;
		}

		.ext-articleguidance-step-content {
			margin: 0;
			max-width: none;
		}
	}
}

</style>
