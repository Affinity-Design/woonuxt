<?php
/**
 * Plugin Name: PSP WooCommerce Transactional Email Safety
 * Description: Sends WooCommerce transactional emails immediately so customer credentials are not persisted in the deferred queue and order emails do not wait for WP-Cron.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_filter(
    'woocommerce_defer_transactional_emails',
    '__return_false',
    PHP_INT_MAX,
    1
);
