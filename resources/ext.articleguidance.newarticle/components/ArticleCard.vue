<template>
	<cdx-card
		class="ext-articleguidance-article-card"
		:class="{
			'ext-articleguidance-article-card--interactive': interactive,
			'ext-articleguidance-article-card--fit-width': fitWidth
		}"
		:thumbnail="cardThumbnail"
		:icon="icon"
		:role="interactive ? 'button' : undefined"
		:tabindex="interactive ? 0 : undefined"
		@keydown.enter.prevent="interactive && $emit( 'click' )"
		@keydown.space.prevent="interactive && $emit( 'click' )"
		@click="interactive && $emit( 'click' )"
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
			type: [ String, Boolean ],
			default: null
		},
		icon: {
			type: [ String, Object ],
			default: null
		},
		interactive: {
			type: Boolean,
			default: false
		},
		fitWidth: {
			type: Boolean,
			default: false
		},
		outlineName: {
			type: String,
			default: null
		}
	},
	emits: [ 'click' ],
	setup( props ) {
		const cardThumbnail = computed( () => {
			// Do not show thumbnail
			if ( props.icon || props.thumbnail === false ) {
				return null;
			}

			// Show thumbnail if a valid URL string is provided
			if ( props.thumbnail && typeof props.thumbnail === 'string' ) {
				return {
					url: props.thumbnail
				};
			}

			// Show default thumbnail
			return {};
		} );

		return { cardThumbnail };
	}
} );
</script>

<style lang="less">
@import 'mediawiki.skin.variables.less';

.ext-articleguidance-article-card {
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

	&.ext-articleguidance-article-card--interactive {
		cursor: pointer;

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

	.cdx-card__icon {
		color: @color-subtle;
		min-width: 20px;
		min-height: 20px;
	}
}

@media screen and ( min-width: @min-width-breakpoint-desktop ) {
	// Desktop view only — Minerva (mobile view) keeps the mobile layout even
	// on wide screens.
	body:not( .skin-minerva ) {
		// Opt-in width adjustment: size the card to its content (single-line
		// description) while staying at least as wide as the action buttons
		// below it, and never exceeding the container.
		.ext-articleguidance-article-card--fit-width {
			// border-box so the 400px floor matches the border-box width of the
			// buttons below (CdxCard adds padding + border, which would
			// otherwise push the card wider than the buttons).
			box-sizing: border-box;
			width: fit-content;
			min-width: 400px;
			max-width: 100%;
		}
	}
}
</style>
