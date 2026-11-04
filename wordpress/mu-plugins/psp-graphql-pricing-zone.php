<?php
/**
 * Plugin Name: PSP GraphQL Pricing Zone
 * Description: Applies Price Based on Country's pricing zone to WPGraphQL requests on WPGraphQL for eCommerce 1.0+, so Canadian carts stay in CAD.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * WPGraphQL for eCommerce 1.0+ marks every GraphQL request as a WooCommerce REST API
 * request and only builds the customer, session and cart on `init_graphql_request`.
 * Price Based on Country decides on `woocommerce_init` (priority 999), before that
 * customer exists, so it skips frontend pricing and GraphQL carts fall back to the
 * base currency (USD) for Canadian shoppers. Found on PROD-03, 2026-11-04: the same
 * Toronto cart was $76.99 CAD on WooGraphQL 0.21.1 and US$54.97 on 1.0.3.
 *
 * Run the plugin's own frontend pricing init once the customer exists. It is
 * idempotent (it returns early if it already ran) and respects the plugin's
 * `wc_price_based_country_stop_pricing` filter.
 */
add_action('init_graphql_request', function () {
    if (!function_exists('wcpbc') || !function_exists('WC') || empty(WC()->customer)) {
        return;
    }
    if (did_action('wc_price_based_country_frontend_init') || apply_filters('wc_price_based_country_stop_pricing', false)) {
        return;
    }
    wcpbc()->frontend_pricing_init();
}, 20);
