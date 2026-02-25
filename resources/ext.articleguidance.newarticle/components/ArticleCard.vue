<template>
	<cdx-card
		class="ext-articleguidance-article-card"
		:thumbnail="cardThumbnail"
		role="button"
		tabindex="0"
		@keydown.enter.prevent="$emit( 'click' )"
		@keydown.space.prevent="$emit( 'click' )"
		@click="$emit( 'click' )"
	>
		<template #title>
			<span class="ext-articleguidance-article-card-title">
				{{ title }}
				<template v-if="outlineName">
					<span class="ext-articleguidance-article-card-separator">·</span>
					<span class="ext-articleguidance-article-card-outline">{{ outlineName }}</span>
				</template>
			</span>
		</template>
		<template v-if="description" #description>
			<span class="ext-articleguidance-article-card-description">
				{{ description }}
			</span>
		</template>
	</cdx-card>
</template>

<script>
const { defineComponent, computed } = require( 'vue' );
const { CdxCard } = require( '../codex.js' );

module.exports = defineComponent( {
	name: 'ArticleCard',
	components: { CdxCard },
	props: {
		title: {
			type: String,
			default: ''
		},
		description: {
			type: String,
			default: ''
		},
		thumbnail: {
			type: String,
			default: null
		},
		outlineName: {
			type: String,
			default: null
		}
	},
	emits: [ 'click' ],
	setup( props ) {
		const cardThumbnail = computed( () => {
			if ( props.thumbnail ) {
				return {
					url: props.thumbnail
				};
			}
			return null;
		} );

		return { cardThumbnail };
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-article-card {
	cursor: pointer;
	transition: background-color 0.2s;

	.ext-articleguidance-article-card-title {
		display: inline;
	}

	.ext-articleguidance-article-card-outline {
		color: @color-placeholder;
		opacity: 0.6;
	}

	.ext-articleguidance-article-card-separator {
		color: @color-placeholder;
		opacity: 0.6;
		margin: 0 4px;
	}

	.cdx-card__thumbnail {
		.cdx-thumbnail {
			width: 100%;
			height: 150px;
			object-fit: cover;
			background-color: @background-color-neutral-subtle;
			display: flex;
			align-items: center;
			justify-content: center;

			img {
				width: 100%;
				height: 100%;
				object-fit: cover;
			}

			&.cdx-thumbnail--placeholder {
				background-color: @background-color-neutral-subtle;

				.cdx-icon {
					opacity: 0.3;
					width: 48px;
					height: 48px;
				}
			}
		}
	}

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
</style>
