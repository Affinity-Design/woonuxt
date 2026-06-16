<?php
/**
 * Snippet: Skate Size Calculator link on single product page
 *
 * Renders a "Skate size calculator" link as its own block BELOW the short
 * description (WooCommerce excerpt is priority 20, add-to-cart is 30, so 25
 * sits between them). Opens in a new tab and uses a scoped CSS class so it
 * no longer clashes with the wishlist / other product-summary widgets.
 *
 * Paste into the Code Snippets plugin (PHP, "Run everywhere" or front-end only).
 */

defined( 'ABSPATH' ) || exit;

// Absolute URL of the calculator page. Change if the slug/domain differs.
const PSP_CALC_URL = 'https://proskatersplace.ca/roller-skates-size-calculator';

add_action( 'woocommerce_single_product_summary', 'psp_render_size_calculator_link', 25 );

function psp_render_size_calculator_link(): void {
	// Inline skate icon (matches the small skate/box glyph in the design).
	$icon = '<svg class="psp-calc-link__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="8" width="20" height="9" rx="2"></rect><line x1="7" y1="8" x2="7" y2="12"></line><line x1="12" y1="8" x2="12" y2="12"></line><line x1="17" y1="8" x2="17" y2="12"></line></svg>';

	printf(
		'<a class="psp-calc-link" href="%1$s" target="_blank" rel="noopener">%2$s<span class="psp-calc-link__label">%3$s</span></a>',
		esc_url( PSP_CALC_URL ),
		$icon, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static SVG
		esc_html__( 'Skate size calculator', 'woocommerce' )
	);
}

add_action( 'wp_head', 'psp_size_calculator_link_styles' );

function psp_size_calculator_link_styles(): void {
	if ( ! function_exists( 'is_product' ) || ! is_product() ) {
		return;
	}
	?>
	<style id="psp-calc-link-styles">
		/* Scoped to .psp-calc-link so it can't inherit / collide with the
		   wishlist widget styles that were causing the clash. */
		.psp-calc-link {
			display: inline-flex;
			align-items: center;
			gap: .5rem;
			clear: both;            /* drop below the short description / wishlist row */
			margin: 1rem 0 0;
			padding: 0;
			font-weight: 600;
			line-height: 1.2;
			text-decoration: none;
			color: #2c6e6a;         /* teal to match the design */
		}
		.psp-calc-link:hover,
		.psp-calc-link:focus {
			text-decoration: underline;
			color: #1f4f4c;
		}
		.psp-calc-link__icon {
			flex: 0 0 auto;
		}
	</style>
	<?php
}
