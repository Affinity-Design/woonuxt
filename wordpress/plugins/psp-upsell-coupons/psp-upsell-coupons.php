<?php
/**
 * Plugin Name:       PSP Conditional Upsell Coupons
 * Description:       Merchant-defined "trigger → target" promotions ("cart has any Endless Frames → 20% off Endless wheels"). Generates session-bound native WooCommerce coupons (UPSELL-XXXXXX) that discount only the target line items, removes them when the trigger leaves the cart, renders notices on the classic storefront, and exposes the same state over WPGraphQL + psp/v1/upsell REST for the headless proskatersplace.ca storefront.
 * Version:           1.0.0
 * Author:            Affinity Design
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 9.0
 * WC tested up to:   11.0
 * Text Domain:       psp-upsell-coupons
 *
 * INSTALL: upload the zip (Plugins → Add New → Upload) on the TEST WordPress
 * first, activate, then run the verification curls in README.md. With zero
 * rules the plugin is inert on both storefronts.
 *
 * Cross-site impact (repo rule #8): additive only — new CPT, option, REST
 * namespace routes, guarded WPGraphQL fields, and coupon filters that
 * early-return for any coupon this plugin did not generate. No existing
 * snippet behaviour, SEO surface, or checkout total changes unless a rule
 * is active for that storefront's channel.
 *
 * Spec: specs/002-conditional-upsell-coupons/ in the WooNuxt repo.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('PSP_UPSELL_VERSION')) define('PSP_UPSELL_VERSION', '1.0.0');
if (!defined('PSP_UPSELL_PLUGIN_FILE')) define('PSP_UPSELL_PLUGIN_FILE', __FILE__);
if (!defined('PSP_UPSELL_PLUGIN_DIR')) define('PSP_UPSELL_PLUGIN_DIR', plugin_dir_path(__FILE__));
if (!defined('PSP_UPSELL_PLUGIN_URL')) define('PSP_UPSELL_PLUGIN_URL', plugin_dir_url(__FILE__));

// Lifetime of a generated coupon after generation. The engine regenerates on the next cart change if the rule still matches.
if (!defined('PSP_UPSELL_COUPON_TTL_HOURS')) define('PSP_UPSELL_COUPON_TTL_HOURS', 48);
// Expired, never-used coupons are hard-deleted this many days after expiry.
if (!defined('PSP_UPSELL_CLEANUP_GRACE_DAYS')) define('PSP_UPSELL_CLEANUP_GRACE_DAYS', 7);
// Consumed (retired) coupons are kept this long for order-level auditing before deletion.
if (!defined('PSP_UPSELL_RETIRED_RETENTION_DAYS')) define('PSP_UPSELL_RETIRED_RETENTION_DAYS', 30);
if (!defined('PSP_UPSELL_CODE_PREFIX')) define('PSP_UPSELL_CODE_PREFIX', 'UPSELL');
if (!defined('PSP_UPSELL_OPTION_COMPILED')) define('PSP_UPSELL_OPTION_COMPILED', 'psp_upsell_rules_compiled');
if (!defined('PSP_UPSELL_OPTION_LAST_CLEANUP')) define('PSP_UPSELL_OPTION_LAST_CLEANUP', 'psp_upsell_last_cleanup');
if (!defined('PSP_UPSELL_OPTION_GRAPHQL')) define('PSP_UPSELL_OPTION_GRAPHQL', 'psp_upsell_graphql_registered');
if (!defined('PSP_UPSELL_SESSION_KEY')) define('PSP_UPSELL_SESSION_KEY', 'psp_upsell');
if (!defined('PSP_UPSELL_CRON_HOOK')) define('PSP_UPSELL_CRON_HOOK', 'psp_upsell_cleanup_daily');

add_action('before_woocommerce_init', function () {
    if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', __FILE__, false);
    }
});

spl_autoload_register(function ($class) {
    if (strpos($class, 'PSP_Upsell_') !== 0) {
        return;
    }
    $file = PSP_UPSELL_PLUGIN_DIR . 'includes/class-' . strtolower(str_replace('_', '-', $class)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p>PSP Conditional Upsell Coupons requires WooCommerce to be active.</p></div>';
        });
        return;
    }

    PSP_Upsell_Rules::init();
    PSP_Upsell_Engine::init();
    PSP_Upsell_Coupons::init();
    PSP_Upsell_Rest::init();
    PSP_Upsell_GraphQL::init();
    PSP_Upsell_Frontend::init();
    PSP_Upsell_Orders::init();
    PSP_Upsell_Cron::init();
    PSP_Upsell_Cache::init();
    PSP_Upsell_Admin::init();
}, 20);

register_activation_hook(__FILE__, function () {
    if (!class_exists('WooCommerce')) {
        return;
    }
    PSP_Upsell_Rules::register_post_type();
    PSP_Upsell_Rules::compile();
    PSP_Upsell_Cron::schedule();
});

register_deactivation_hook(__FILE__, function () {
    PSP_Upsell_Cron::unschedule();
});
