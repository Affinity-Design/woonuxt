<?php
/**
 * Generated coupon lifecycle and the WooCommerce validation filters that
 * bind a coupon to one session/rule and isolate the discount to target lines.
 *
 * Every filter early-returns for coupons this plugin did not generate.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Coupons {

    const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const META_RULE_ID = '_psp_upsell_rule_id';
    const META_RULE_HASH = '_psp_upsell_rule_hash';
    const META_SESSION = '_psp_upsell_session';
    const META_CHANNEL = '_psp_upsell_channel';
    const META_GENERATED_AT = '_psp_upsell_generated_at';
    const META_RETIRED = '_psp_upsell_retired';

    private static $rule_id_cache = array();

    public static function init() {
        add_filter('woocommerce_coupon_is_valid', array(__CLASS__, 'filter_is_valid'), 10, 3);
        add_filter('woocommerce_coupon_is_valid_for_product', array(__CLASS__, 'filter_is_valid_for_product'), 10, 4);
        add_filter('woocommerce_cart_totals_coupon_label', array(__CLASS__, 'filter_label'), 10, 2);
        add_filter('woocommerce_coupon_message', array(__CLASS__, 'filter_suppress_message'), 10, 3);
        add_filter('woocommerce_coupon_error', array(__CLASS__, 'filter_suppress_message'), 10, 3);
    }

    // ------------------------------------------------------------------
    // Identification
    // ------------------------------------------------------------------

    public static function is_generated_code($code) {
        if (!is_string($code) || $code === '') {
            return false;
        }
        $prefixes = apply_filters('psp_upsell_code_prefixes', array(PSP_UPSELL_CODE_PREFIX));
        foreach ($prefixes as $prefix) {
            if (stripos($code, $prefix . '-') === 0) {
                return true;
            }
        }
        return false;
    }

    public static function rule_id_for_code($code) {
        $code = strtolower((string) $code);
        if (!isset(self::$rule_id_cache[$code])) {
            $id = function_exists('wc_get_coupon_id_by_code') ? wc_get_coupon_id_by_code($code) : 0;
            self::$rule_id_cache[$code] = $id ? (int) get_post_meta($id, self::META_RULE_ID, true) : 0;
        }
        return self::$rule_id_cache[$code];
    }

    public static function is_generated(WC_Coupon $coupon) {
        return $coupon->get_id() && (int) $coupon->get_meta(self::META_RULE_ID) > 0;
    }

    // ------------------------------------------------------------------
    // Generation
    // ------------------------------------------------------------------

    /**
     * Reuse the session's live coupon for this rule, or create one.
     *
     * @return string|null lowercase coupon code
     */
    public static function find_or_generate(array $rule, $session_id, $channel, $known_code = null) {
        $rid = (int) $rule['id'];

        if ($known_code) {
            $coupon = new WC_Coupon($known_code);
            if (self::reusable($coupon, $rule, $session_id)) {
                return $coupon->get_code();
            }
        }

        if ($session_id !== '') {
            $ids = get_posts(array(
                'post_type'   => 'shop_coupon',
                'post_status' => 'publish',
                'fields'      => 'ids',
                'numberposts' => 3,
                'orderby'     => 'ID',
                'order'       => 'DESC',
                'meta_query'  => array(
                    array('key' => self::META_SESSION, 'value' => (string) $session_id),
                    array('key' => self::META_RULE_ID, 'value' => (string) $rid),
                ),
            ));
            foreach ($ids as $id) {
                $coupon = new WC_Coupon((int) $id);
                if (self::reusable($coupon, $rule, $session_id)) {
                    return $coupon->get_code();
                }
            }
        }

        return self::generate($rule, $session_id, $channel);
    }

    private static function reusable(WC_Coupon $coupon, array $rule, $session_id) {
        if (!$coupon->get_id() || !self::is_generated($coupon)) {
            return false;
        }
        if ((int) $coupon->get_meta(self::META_RULE_ID) !== (int) $rule['id']) {
            return false;
        }
        if ($coupon->get_meta(self::META_RETIRED)) {
            return false;
        }
        if ((string) $coupon->get_meta(self::META_RULE_HASH) !== (string) $rule['hash']) {
            return false;
        }
        if ((string) $coupon->get_meta(self::META_SESSION) !== (string) $session_id) {
            return false;
        }
        $expires = $coupon->get_date_expires();
        if ($expires && $expires->getTimestamp() <= time()) {
            return false;
        }
        if ($coupon->get_usage_count() >= max(1, (int) $coupon->get_usage_limit())) {
            return false;
        }
        return true;
    }

    private static function generate(array $rule, $session_id, $channel) {
        $prefix = strtoupper($rule['coupon']['code_prefix'] ?? PSP_UPSELL_CODE_PREFIX);
        $code = null;
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $candidate = $prefix . '-' . self::random_suffix(6);
            if (!wc_get_coupon_id_by_code($candidate)) {
                $code = $candidate;
                break;
            }
        }
        if (!$code) {
            return null;
        }

        $ttl_hours = max(1, (int) ($rule['coupon']['ttl_hours'] ?? PSP_UPSELL_COUPON_TTL_HOURS));

        try {
            $coupon = new WC_Coupon();
            $coupon->set_code($code);
            $coupon->set_discount_type('percent');
            $coupon->set_amount((float) $rule['discount']['amount']);
            $coupon->set_individual_use(false);
            $coupon->set_usage_limit(1);
            $coupon->set_usage_limit_per_user(1);
            $coupon->set_date_expires(time() + $ttl_hours * HOUR_IN_SECONDS);
            $coupon->set_exclude_sale_items(!empty($rule['target']['exclude_sale_items']));
            $coupon->set_free_shipping(false);
            if (!empty($rule['target']['max_qty_per_order'])) {
                $coupon->set_limit_usage_to_x_items((int) $rule['target']['max_qty_per_order']);
            }
            $category_ids = self::category_restriction($rule);
            if ($category_ids) {
                $coupon->set_product_categories($category_ids);
            }
            $coupon->set_description(sprintf('Auto-generated upsell coupon — rule #%d "%s" (%s). Managed by PSP Conditional Upsell Coupons; do not edit.', $rule['id'], $rule['name'], $channel));
            $coupon->update_meta_data(self::META_RULE_ID, (int) $rule['id']);
            $coupon->update_meta_data(self::META_RULE_HASH, (string) $rule['hash']);
            $coupon->update_meta_data(self::META_SESSION, (string) $session_id);
            $coupon->update_meta_data(self::META_CHANNEL, (string) $channel);
            $coupon->update_meta_data(self::META_GENERATED_AT, time());
            $coupon->save();
        } catch (Exception $e) {
            error_log('[psp-upsell] coupon generation failed: ' . $e->getMessage());
            return null;
        }

        do_action('psp_upsell_coupon_generated', $coupon, $rule, $session_id, $channel);
        return $coupon->get_code();
    }

    /** Native category restriction when every target selector is a product category (belt-and-braces; the filter still isolates). */
    private static function category_restriction(array $rule) {
        $ids = array();
        foreach ($rule['target']['selectors'] as $sel) {
            if ($sel['taxonomy'] !== 'product_cat') {
                return array();
            }
            $ids = array_merge($ids, $sel['term_ids']);
        }
        return array_values(array_unique(array_map('intval', $ids)));
    }

    private static function random_suffix($length) {
        $alphabet = self::CODE_ALPHABET;
        $max = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < $length; $i++) {
            try {
                $index = random_int(0, $max);
            } catch (Exception $e) {
                $index = wp_rand(0, $max);
            }
            $out .= $alphabet[$index];
        }
        return $out;
    }

    public static function retire($coupon, $order_id = 0) {
        if (!$coupon instanceof WC_Coupon) {
            $coupon = new WC_Coupon($coupon);
        }
        if (!$coupon->get_id()) {
            return;
        }
        $coupon->update_meta_data(self::META_RETIRED, $order_id ? (int) $order_id : 1);
        $coupon->set_usage_limit(1);
        $coupon->save();
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    /** Full validity check for a generated coupon in the current storefront context. */
    public static function validate_generated(WC_Coupon $coupon, $channel = null) {
        if (!self::is_generated($coupon)) {
            return false;
        }
        if ($coupon->get_meta(self::META_RETIRED)) {
            return false;
        }
        $channel = $channel ?: PSP_Upsell_Channel::current();
        if (!$channel) {
            return false;
        }
        $rule = PSP_Upsell_Rules::find_active((int) $coupon->get_meta(self::META_RULE_ID), $channel);
        if (!$rule) {
            return false;
        }
        if ((string) $coupon->get_meta(self::META_RULE_HASH) !== (string) $rule['hash']) {
            return false;
        }
        $expires = $coupon->get_date_expires();
        if ($expires && $expires->getTimestamp() <= time()) {
            return false;
        }
        if (function_exists('WC') && WC()->session) {
            $sid = (string) WC()->session->get_customer_id();
            if ($sid !== '' && (string) $coupon->get_meta(self::META_SESSION) !== $sid) {
                return false;
            }
        }
        return PSP_Upsell_Engine::trigger_satisfied($rule, $channel);
    }

    public static function filter_is_valid($valid, $coupon, $discounts = null) {
        if (!$coupon instanceof WC_Coupon || !self::is_generated($coupon)) {
            return $valid;
        }
        if (!$valid) {
            return false;
        }
        $channel = PSP_Upsell_Channel::current();
        if (!$channel) {
            return $valid; // admin/REST order contexts: no opinion
        }
        return self::validate_generated($coupon, $channel);
    }

    public static function filter_is_valid_for_product($valid, $product, $coupon, $values) {
        if (!$coupon instanceof WC_Coupon || !self::is_generated($coupon)) {
            return $valid;
        }
        $rid = (int) $coupon->get_meta(self::META_RULE_ID);
        $channel = PSP_Upsell_Channel::current();
        $rule = $channel ? PSP_Upsell_Rules::find_active($rid, $channel) : null;
        if (!$rule) {
            foreach (PSP_Upsell_Rules::get_compiled()['rules'] as $candidate) {
                if ((int) $candidate['id'] === $rid) {
                    $rule = $candidate;
                    break;
                }
            }
        }
        if (!$rule) {
            return false;
        }

        $key = is_array($values) && isset($values['key']) ? (string) $values['key'] : null;
        if ($key !== null && $channel) {
            $assigned = PSP_Upsell_Engine::line_is_target($rule, $key, $channel);
            if ($assigned !== null) {
                return (bool) $assigned;
            }
        }

        // No live cart evaluation (order recalculation etc.): match directly.
        $product_id = PSP_Upsell_Engine::line_product_id($product, is_array($values) ? $values : null);
        if (!$product_id) {
            return false;
        }
        if (!empty($rule['target']['exclude_trigger_items']) && PSP_Upsell_Engine::product_matches_trigger($product_id, $rule)) {
            return false;
        }
        return PSP_Upsell_Engine::product_matches_target($product_id, $rule);
    }

    public static function filter_label($label, $coupon) {
        if (!$coupon instanceof WC_Coupon || !self::is_generated($coupon)) {
            return $label;
        }
        $rid = (int) $coupon->get_meta(self::META_RULE_ID);
        $channel = PSP_Upsell_Channel::current() ?: 'com';
        $rule = PSP_Upsell_Rules::find_active($rid, $channel);
        if (!$rule) {
            return $label;
        }
        $locale = apply_filters('psp_upsell_locale', 'en');
        return esc_html(PSP_Upsell_Rules::notice_text($rule, 'coupon_label', $locale));
    }

    /** WooCommerce's own "coupon applied/removed/invalid" notices are replaced by the plugin's notices. */
    public static function filter_suppress_message($message, $code, $coupon) {
        if ($coupon instanceof WC_Coupon && self::is_generated($coupon)) {
            return '';
        }
        return $message;
    }

    // ------------------------------------------------------------------
    // Reporting helpers
    // ------------------------------------------------------------------

    public static function count_generated($filter = 'live') {
        $args = array(
            'post_type'   => 'shop_coupon',
            'post_status' => 'publish',
            'fields'      => 'ids',
            'numberposts' => -1,
            'meta_query'  => array(array('key' => self::META_RULE_ID, 'compare' => 'EXISTS')),
        );
        $ids = get_posts($args);
        if ($filter === 'all') {
            return count($ids);
        }
        $live = 0;
        $expired_unused = 0;
        $retired = 0;
        foreach ($ids as $id) {
            $coupon = new WC_Coupon((int) $id);
            $expires = $coupon->get_date_expires();
            if ($coupon->get_meta(self::META_RETIRED)) {
                $retired++;
            } elseif ($expires && $expires->getTimestamp() <= time()) {
                $expired_unused++;
            } else {
                $live++;
            }
        }
        if ($filter === 'expired_unused') {
            return $expired_unused;
        }
        if ($filter === 'retired') {
            return $retired;
        }
        return $live;
    }
}
