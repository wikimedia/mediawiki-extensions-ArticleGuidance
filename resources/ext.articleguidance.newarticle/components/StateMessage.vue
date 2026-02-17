<template>
	<div class="ext-articleguidance-state-message">
		<slot>{{ message }}</slot>
	</div>
</template>

<script>
const { defineComponent } = require( 'vue' );

module.exports = defineComponent( {
	name: 'StateMessage',
	props: {
		message: {
			type: String,
			default: ''
		}
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-state-message {
	padding: 24px;
	text-align: center;
	color: @color-subtle;
	font-style: italic;
}
</style>
