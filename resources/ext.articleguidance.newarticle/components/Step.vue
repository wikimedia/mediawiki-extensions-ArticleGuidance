<template>
	<div :class="'ext-articleguidance-' + stepName + '-step'">
		<step-header
			:title="title"
			:show-back="showBack"
			@back="handleBack"
		>
		</step-header>
		<div class="ext-articleguidance-step-body">
			<slot></slot>
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
.ext-articleguidance-step-body {
	padding: 12px;
}
</style>
