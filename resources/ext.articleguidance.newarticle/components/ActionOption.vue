<template>
	<cdx-card
		class="ext-articleguidance-action-option"
		:class="{ 'ext-articleguidance-action-option--interactive': !url }"
		:icon="icon"
		:url="url || undefined"
		:target="isExternal ? '_blank' : undefined"
		:rel="isExternal ? 'noopener noreferrer' : undefined"
		:role="!url ? 'button' : undefined"
		:tabindex="!url ? 0 : undefined"
		@click="handleClick"
		@keydown.enter.prevent="!url && handleClick()"
		@keydown.space.prevent="!url && handleClick()"
	>
		<template #title>
			{{ title }}
		</template>
		<template #description>
			{{ description }}
		</template>
	</cdx-card>
</template>

<script>
const { defineComponent, computed } = require( 'vue' );
const { CdxCard } = require( '../codex.js' );

module.exports = defineComponent( {
	name: 'ActionOption',
	components: { CdxCard },
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
		},
		log: {
			type: Function,
			default: null
		}
	},
	setup( props ) {
		const isExternal = computed(
			() => props.url !== null && props.url.startsWith( 'http' )
		);

		const handleClick = () => {
			if ( props.log ) {
				props.log();
			}
			if ( props.action ) {
				props.action();
			}
		};

		return { isExternal, handleClick };
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-action-option {
	.cdx-card__icon {
		color: @color-base;
	}

	// CdxCard only applies clickable affordances to link (`url`) cards. The
	// no-url "action" variant is made interactive via role/tabindex, so mirror
	// ArticleCard's interactive states here.
	&.ext-articleguidance-action-option--interactive {
		cursor: pointer;
		transition: background-color 0.2s;

		&:hover {
			background-color: @background-color-interactive-subtle;
		}

		&:active {
			background-color: @background-color-interactive;
		}

		&:focus-visible {
			outline: 2px solid @color-progressive;
			outline-offset: 2px;
		}
	}
}
</style>
