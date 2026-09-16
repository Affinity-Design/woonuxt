<?php
/**
 * Classic storefront (.com) output: product banner, cart notices, checkout breakdown.
 * Templates can be overridden by a theme at <theme>/psp-upsell/<file>.php.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Frontend {

    public static function init() {
        if (is_admin() && !(function_exists('wp_doing_ajax') && wp_doing_ajax())) {
            return;
        }
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue'));
        // After the form, not inside it: themes such as Shoptimizer lay form.cart out as a flex row, so a
        // block hooked after the button becomes a squeezed flex item beside it.
        add_action('woocommerce_after_add_to_cart_form', array(__CLASS__, 'product_banner'), 5);
        add_action('woocommerce_before_cart', array(__CLASS__, 'cart_notices'), 5);
        add_action('woocommerce_review_order_before_cart_contents', array(__CLASS__, 'checkout_breakdown'));
    }

    private static function locale() {
        return apply_filters('psp_upsell_locale', 'en');
    }

    private static function is_com() {
        return PSP_Upsell_Channel::current() === 'com';
    }

    public static function enqueue() {
        if (!function_exists('is_product')) {
            return;
        }
        if (is_product() || is_cart() || is_checkout()) {
            wp_enqueue_style('psp-upsell', PSP_UPSELL_PLUGIN_URL . 'assets/upsell.css', array(), PSP_UPSELL_VERSION);
        }
    }

    public static function product_banner() {
        if (!self::is_com()) {
            return;
        }
        global $product;
        if (!$product instanceof WC_Product) {
            return;
        }
        $offers = PSP_Upsell_Engine::product_offers($product->get_id(), 'com', self::locale());
        if (empty($offers)) {
            return;
        }
        $offers = array_slice($offers, 0, (int) apply_filters('psp_upsell_max_product_banners', 2));
        echo self::render('product-banner.php', array('offers' => $offers)); // phpcs:ignore WordPress.Security.EscapeOutput
    }

    public static function cart_notices() {
        if (!self::is_com() || !function_exists('WC') || !WC()->cart || WC()->cart->is_empty()) {
            return;
        }
        $state = PSP_Upsell_Engine::public_state(self::locale());
        foreach ($state['cart_notices'] as $notice) {
            $html = self::render('cart-notice.php', array('notice' => $notice));
            wc_print_notice($html, $notice['kind'] === 'applied' ? 'success' : 'notice');
        }
    }

    public static function checkout_breakdown() {
        if (!self::is_com() || !function_exists('WC') || !WC()->cart) {
            return;
        }
        $lines = PSP_Upsell_Engine::line_discounts(self::locale());
        if (empty($lines)) {
            return;
        }
        $cart = WC()->cart->get_cart();
        foreach ($lines as $i => $line) {
            $item = $cart[$line['cart_item_key']] ?? null;
            $lines[$i]['item_name'] = ($item && isset($item['data']) && $item['data'] instanceof WC_Product) ? $item['data']->get_name() : '';
        }
        echo self::render('checkout-breakdown.php', array('lines' => $lines)); // phpcs:ignore WordPress.Security.EscapeOutput
    }

    private static function render($file, array $vars) {
        $template = locate_template('psp-upsell/' . $file);
        if (!$template) {
            $template = PSP_UPSELL_PLUGIN_DIR . 'templates/' . $file;
        }
        if (!is_readable($template)) {
            return '';
        }
        extract($vars, EXTR_SKIP); // phpcs:ignore WordPress.PHP.DontExtract
        ob_start();
        include $template;
        return (string) ob_get_clean();
    }
}
