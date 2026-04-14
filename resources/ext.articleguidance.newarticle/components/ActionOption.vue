<template>
	<div class="ext-articleguidance-action-option">
		<cdx-icon
			:icon="icon"
			class="ext-articleguidance-action-option-icon"
		></cdx-icon>
		<div class="ext-articleguidance-action-option-content">
			<component
				:is="url ? 'a' : 'button'"
				v-bind="url ? { href: url, target: isExternal ? '_blank' : undefined } : {}"
				class="ext-articleguidance-action-option-title"
				@click="action && action()"
			>
				{{ title }}
			</component>
			<p class="ext-articleguidance-action-option-description">
				{{ description }}
			</p>
		</div>
	</div>
</template>

<script>
const { defineComponent, computed } = require( 'vue' );
const { CdxIcon } = require( '../codex.js' );

module.exports = defineComponent( {
	name: 'ActionOption',
	components: { CdxIcon },
	props: {
		icon: {
			type: [ String, Object ],
			required: true
		},
		title: {
			type: String,
			required: true
		},
		description: {
			type: String,
			required: true
		},
		url: {
			type: String,
			default: null
		},
		action: {
			type: Function,
			default: null
		}
	},
	setup( props ) {
		const isExternal = computed(
			() => props.url !== null && props.url.startsWith( 'http' )
		);
		return { isExternal };
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-action-option {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 0;
	border-bottom: 1px solid @border-color-subtle;

	&:first-child {
		border-top: 1px solid @border-color-subtle;
	}
}

.ext-articleguidance-action-option-icon.cdx-icon {
	color: @color-progressive;
	flex-shrink: 0;
	margin-top: 2px;
}

.ext-articleguidance-action-option-content {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.ext-articleguidance-action-option-title {
	color: @color-progressive;
	font-weight: @font-weight-normal;

	&:is( button ) {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font-size: inherit;
		font-family: inherit;
		text-align: start;
	}
}

.ext-articleguidance-action-option-description {
	margin: 0;
	color: @color-subtle;
	font-size: @font-size-small;
}
</style>
