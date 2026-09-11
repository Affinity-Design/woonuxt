<?php
/**
 * Rule evaluation and cart synchronisation.
 *
 * evaluate() is pure (no side effects). sync() runs once per request on the
 * first totals calculation after a cart mutation, applies/removes generated
 * coupons, and writes the session snapshot the storefronts read.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Engine {

    private static $dirty = true;
    private static $in_sync = false;
    private static $term_cache = array();
    /** @var array|null ['signature' => string, 'eval' => array] */
    private static $last_eval = null;

    public static function init() {
        $mark = array(__CLASS__, 'mark_dirty');
        add_action('woocommerce_cart_loaded_from_session', $mark, 5);
        add_action('woocommerce_add_to_cart', $mark, 5);
        add_action('woocommerce_cart_item_removed', $mark, 5);
        add_action('woocommerce_cart_item_restored', $mark, 5);
        add_action('woocommerce_after_cart_item_quantity_update', $mark, 5);
        add_action('woocommerce_cart_emptied', $mark, 5);
        add_action('woocommerce_applied_coupon', $mark, 5);
        add_action('woocommerce_removed_coupon', array(__CLASS__, 'on_coupon_removed'), 5);

        add_action('woocommerce_check_cart_items', array(__CLASS__, 'sync'), 1);
        add_action('woocommerce_before_calculate_totals', array(__CLASS__, 'sync'), 5);
    }

    public static function mark_dirty() {
        self::$dirty = true;
        self::$last_eval = null;
    }

    // ------------------------------------------------------------------
    // Matching
    // ------------------------------------------------------------------

    public static function product_term_ids($product_id, $taxonomy) {
        $product_id = (int) $product_id;
        $key = $product_id . '|' . $taxonomy;
        if (!isset(self::$term_cache[$key])) {
            $ids = wp_get_object_terms($product_id, $taxonomy, array('fields' => 'ids'));
            self::$term_cache[$key] = is_wp_error($ids) ? array() : array_map('intval', $ids);
        }
        return self::$term_cache[$key];
    }

    public static function product_matches_selector($product_id, array $selector) {
        $ids = self::product_term_ids($product_id, $selector['taxonomy']);
        if (empty($ids)) {
            return false;
        }
        return (bool) array_intersect($ids, $selector['term_ids']);
    }

    public static function product_matches_trigger($product_id, array $rule) {
        foreach ($rule['trigger']['selectors'] as $sel) {
            if (self::product_matches_selector($product_id, $sel)) {
                return true;
            }
        }
        return false;
    }

    public static function product_matches_target($product_id, array $rule) {
        $selectors = $rule['target']['selectors'];
        if (empty($selectors)) {
            return false;
        }
        $any = ($rule['target']['match'] ?? 'all') === 'any';
        foreach ($selectors as $sel) {
            $hit = self::product_matches_selector($product_id, $sel);
            if ($any && $hit) {
                return true;
            }
            if (!$any && !$hit) {
                return false;
            }
        }
        return !$any;
    }

    /** Parent product id for a cart/order line (variations match on their parent's terms). */
    public static function line_product_id($product, $values = null) {
        if (is_array($values) && !empty($values['product_id'])) {
            return (int) $values['product_id'];
        }
        if ($product instanceof WC_Product) {
            $parent = $product->get_parent_id();
            return (int) ($parent ? $parent : $product->get_id());
        }
        return 0;
    }

    // ------------------------------------------------------------------
    // Evaluation (pure)
    // ------------------------------------------------------------------

    public static function evaluate(WC_Cart $cart, $channel, $rules = null) {
        if ($rules === null) {
            $rules = PSP_Upsell_Rules::get_active($channel);
        }
        $by_id = array();
        foreach ($rules as $rule) {
            $by_id[(int) $rule['id']] = $rule;
        }
        $rules = $by_id;
        $items = $cart->get_cart();
        $offers = array();

        foreach ($rules as $rule) {
            $rid = (int) $rule['id'];
            $trigger_lines = array();
            $trigger_qty = 0;
            $target_lines = array();

            foreach ($items as $key => $item) {
                $pid = (int) ($item['product_id'] ?? 0);
                if (!$pid) {
                    continue;
                }
                $is_trigger = self::product_matches_trigger($pid, $rule);
                if ($is_trigger) {
                    $trigger_lines[] = $key;
                    $trigger_qty += (int) ($item['quantity'] ?? 0);
                    if (!empty($rule['target']['exclude_trigger_items'])) {
                        continue;
                    }
                }
                if (!self::product_matches_target($pid, $rule)) {
                    continue;
                }
                if (!empty($rule['target']['exclude_sale_items'])) {
                    $product = $item['data'] ?? null;
                    if ($product instanceof WC_Product && $product->is_on_sale('edit')) {
                        continue;
                    }
                }
                $target_lines[] = $key;
            }

            $state = 'inactive';
            if ($trigger_qty >= max(1, (int) $rule['trigger']['min_qty'])) {
                $state = empty($target_lines) ? 'pending' : 'applied';
            }
            $offers[$rid] = array(
                'rule_id'       => $rid,
                'state'         => $state,
                'trigger_lines' => $trigger_lines,
                'trigger_qty'   => $trigger_qty,
                'target_lines'  => $target_lines,
                'coupon_code'   => null,
            );
        }

        // One upsell discount per line: the highest percent wins, ties go to the earlier (lower priority number) rule.
        $claims = array();
        foreach ($rules as $rule) {
            $rid = (int) $rule['id'];
            if ($offers[$rid]['state'] !== 'applied') {
                continue;
            }
            $kept = array();
            foreach ($offers[$rid]['target_lines'] as $key) {
                if (!isset($claims[$key])) {
                    $claims[$key] = $rid;
                    $kept[] = $key;
                    continue;
                }
                $holder = $claims[$key];
                if ((float) $rule['discount']['amount'] > (float) $rules[$holder]['discount']['amount']) {
                    $offers[$holder]['target_lines'] = array_values(array_diff($offers[$holder]['target_lines'], array($key)));
                    $claims[$key] = $rid;
                    $kept[] = $key;
                }
            }
            $offers[$rid]['target_lines'] = $kept;
        }
        foreach ($offers as $rid => $offer) {
            if ($offer['state'] === 'applied' && empty($offer['target_lines'])) {
                $offers[$rid]['state'] = 'inactive';
            }
        }

        return array(
            'channel'       => $channel,
            'rules_version' => PSP_Upsell_Rules::version(),
            'offers'        => $offers,
        );
    }

    private static function cart_signature(WC_Cart $cart, $channel) {
        $lines = array();
        foreach ($cart->get_cart() as $key => $item) {
            $lines[$key] = (int) ($item['quantity'] ?? 0);
        }
        ksort($lines);
        return md5($channel . '|' . PSP_Upsell_Rules::version() . '|' . wp_json_encode($lines));
    }

    /** Cached evaluation of the live cart for the current channel. */
    public static function current_eval($channel = null) {
        if (!function_exists('WC') || !WC()->cart) {
            return null;
        }
        $channel = $channel ?: PSP_Upsell_Channel::current();
        if (!$channel) {
            return null;
        }
        $signature = self::cart_signature(WC()->cart, $channel);
        if (self::$last_eval && self::$last_eval['signature'] === $signature) {
            return self::$last_eval['eval'];
        }
        $eval = self::evaluate(WC()->cart, $channel);
        self::$last_eval = array('signature' => $signature, 'eval' => $eval);
        return $eval;
    }

    public static function trigger_satisfied(array $rule, $channel = null) {
        $eval = self::current_eval($channel);
        if (!$eval) {
            return false;
        }
        $offer = $eval['offers'][(int) $rule['id']] ?? null;
        return $offer && $offer['trigger_qty'] >= max(1, (int) $rule['trigger']['min_qty']);
    }

    /** Is this cart line one of the rule's assigned target lines (after best-per-line resolution)? */
    public static function line_is_target(array $rule, $cart_item_key, $channel = null) {
        $eval = self::current_eval($channel);
        if (!$eval) {
            return null;
        }
        $offer = $eval['offers'][(int) $rule['id']] ?? null;
        return $offer ? in_array($cart_item_key, $offer['target_lines'], true) : false;
    }

    private static function offer_signature(array $offer) {
        $lines = array_merge($offer['trigger_lines'], $offer['target_lines']);
        sort($lines);
        return sha1(implode(',', $lines));
    }

    // ------------------------------------------------------------------
    // Sync (side effects)
    // ------------------------------------------------------------------

    public static function sync() {
        if (self::$in_sync || !self::$dirty) {
            return;
        }
        if (!function_exists('WC') || !WC()->cart || !WC()->session) {
            return;
        }
        $channel = PSP_Upsell_Channel::current();
        if (!$channel) {
            return;
        }
        if (!function_exists('wc_coupons_enabled') || !wc_coupons_enabled()) {
            return;
        }

        $cart = WC()->cart;
        $rules = PSP_Upsell_Rules::get_active($channel);
        $applied = $cart->get_applied_coupons();
        $generated_applied = array_values(array_filter($applied, array('PSP_Upsell_Coupons', 'is_generated_code')));

        if (empty($rules) && empty($generated_applied)) {
            self::$dirty = false;
            return;
        }

        self::$in_sync = true;
        try {
            $eval = self::current_eval($channel);
            $offers = $eval['offers'];
            $state = WC()->session->get(PSP_UPSELL_SESSION_KEY);
            $state = is_array($state) ? $state : array();
            $dismissed = is_array($state['dismissed'] ?? null) ? $state['dismissed'] : array();
            $codes = is_array($state['coupons'] ?? null) ? $state['coupons'] : array();
            $session_id = (string) WC()->session->get_customer_id();
            $keep = array();

            foreach ($rules as $rule) {
                $rid = (int) $rule['id'];
                if (!isset($offers[$rid]) || $offers[$rid]['state'] !== 'applied') {
                    continue;
                }
                $signature = self::offer_signature($offers[$rid]);
                if (isset($dismissed[$rid]) && $dismissed[$rid] === $signature) {
                    $offers[$rid]['state'] = 'dismissed';
                    continue;
                }
                unset($dismissed[$rid]);

                $code = PSP_Upsell_Coupons::find_or_generate($rule, $session_id, $channel, $codes[$rid] ?? null);
                if (!$code) {
                    continue;
                }
                $codes[$rid] = $code;
                $offers[$rid]['coupon_code'] = $code;
                $keep[$code] = $rid;
                if (!in_array($code, $applied, true)) {
                    $coupon = new WC_Coupon($code);
                    if (PSP_Upsell_Coupons::validate_generated($coupon, $channel)) {
                        $cart->apply_coupon($code);
                    }
                }
            }

            foreach ($generated_applied as $code) {
                if (!isset($keep[$code])) {
                    $cart->remove_coupon($code);
                }
            }

            WC()->session->set(PSP_UPSELL_SESSION_KEY, array(
                'channel'       => $channel,
                'evaluated_at'  => time(),
                'rules_version' => $eval['rules_version'],
                'offers'        => $offers,
                'dismissed'     => $dismissed,
                'coupons'       => $codes,
            ));
            self::$dirty = false;
        } finally {
            self::$in_sync = false;
        }
    }

    /** Shopper removed a generated coupon: remember it for this exact trigger/target line set. */
    public static function on_coupon_removed($code) {
        if (self::$in_sync) {
            return;
        }
        self::mark_dirty();
        if (!PSP_Upsell_Coupons::is_generated_code($code) || !WC()->session) {
            return;
        }
        $rid = PSP_Upsell_Coupons::rule_id_for_code($code);
        if (!$rid) {
            return;
        }
        $eval = self::current_eval();
        if (!$eval || empty($eval['offers'][$rid])) {
            return;
        }
        $state = WC()->session->get(PSP_UPSELL_SESSION_KEY);
        $state = is_array($state) ? $state : array();
        $state['dismissed'] = is_array($state['dismissed'] ?? null) ? $state['dismissed'] : array();
        $state['dismissed'][$rid] = self::offer_signature($eval['offers'][$rid]);
        WC()->session->set(PSP_UPSELL_SESSION_KEY, $state);
    }

    // ------------------------------------------------------------------
    // Read side
    // ------------------------------------------------------------------

    public static function get_state() {
        $state = (function_exists('WC') && WC()->session) ? WC()->session->get(PSP_UPSELL_SESSION_KEY) : null;
        if (!is_array($state)) {
            $state = array('channel' => PSP_Upsell_Channel::current(), 'evaluated_at' => 0, 'rules_version' => '', 'offers' => array(), 'dismissed' => array(), 'coupons' => array());
        }
        return $state;
    }

    /** Per-line discounts attributable to generated coupons: [ [cart_item_key, rule_id, coupon_code, amount, label] ]. */
    public static function line_discounts($locale = 'en') {
        if (!function_exists('WC') || !WC()->cart || !class_exists('WC_Discounts')) {
            return array();
        }
        $cart = WC()->cart;
        $generated = array();
        foreach ($cart->get_coupons() as $code => $coupon) {
            if (PSP_Upsell_Coupons::is_generated_code($code)) {
                $generated[$code] = $coupon;
            }
        }
        if (empty($generated)) {
            return array();
        }
        $discounts = new WC_Discounts($cart);
        foreach ($cart->get_coupons() as $coupon) {
            $discounts->apply_coupon($coupon, false);
        }
        $per_coupon = $discounts->get_discounts(false);
        $out = array();
        $channel = PSP_Upsell_Channel::current() ?: 'com';
        foreach ($generated as $code => $coupon) {
            $rid = PSP_Upsell_Coupons::rule_id_for_code($code);
            $rule = $rid ? PSP_Upsell_Rules::find_active($rid, $channel) : null;
            $label = $rule ? PSP_Upsell_Rules::notice_text($rule, 'checkout', $locale) : strtoupper($code);
            foreach ((array) ($per_coupon[$code] ?? array()) as $item_key => $amount) {
                if ((float) $amount <= 0) {
                    continue;
                }
                $out[] = array(
                    'cart_item_key' => (string) $item_key,
                    'rule_id'       => (int) $rid,
                    'coupon_code'   => strtoupper($code),
                    'amount'        => wc_format_decimal($amount, wc_get_price_decimals()),
                    'label'         => $label,
                );
            }
        }
        return $out;
    }

    /** Storefront-facing cart state (GraphQL Cart.upsell / REST evaluate). */
    public static function public_state($locale = 'en') {
        $state = self::get_state();
        $channel = $state['channel'] ?: (PSP_Upsell_Channel::current() ?: 'com');
        $rules = PSP_Upsell_Rules::get_active($channel);
        $applied_codes = (function_exists('WC') && WC()->cart) ? WC()->cart->get_applied_coupons() : array();

        $eligible = array();
        $notices = array();
        $missing = array();
        $auto = array();
        $validated = array();

        foreach ($state['offers'] as $rid => $offer) {
            $rule = $rules[(int) $rid] ?? null;
            if (!$rule || $offer['state'] === 'inactive') {
                continue;
            }
            $code = $offer['coupon_code'] ? strtoupper($offer['coupon_code']) : null;
            $eligible[] = array(
                'rule_id'     => (int) $rid,
                'state'       => $offer['state'],
                'label'       => $rule['name'],
                'coupon_code' => $code,
                'discount'    => $rule['discount']['display'],
                'amount'      => (float) $rule['discount']['amount'],
            );
            if ($offer['state'] === 'pending') {
                $notices[] = array(
                    'rule_id'  => (int) $rid,
                    'kind'     => 'pending',
                    'text'     => PSP_Upsell_Rules::notice_text($rule, 'cart_pending', $locale),
                    'cta_path' => $rule['cta'][$channel]['trigger_side'],
                    'amount'   => (float) $rule['discount']['amount'],
                );
                $missing[] = array(
                    'rule_id'  => (int) $rid,
                    'label'    => $rule['target']['label'],
                    'cta_path' => $rule['cta'][$channel]['trigger_side'],
                );
            } elseif ($offer['state'] === 'applied' && $offer['coupon_code'] && in_array($offer['coupon_code'], $applied_codes, true)) {
                $notices[] = array(
                    'rule_id'  => (int) $rid,
                    'kind'     => 'applied',
                    'text'     => PSP_Upsell_Rules::notice_text($rule, 'cart_applied', $locale),
                    'cta_path' => null,
                    'amount'   => (float) $rule['discount']['amount'],
                );
                $auto[] = $code;
                $coupon = new WC_Coupon($offer['coupon_code']);
                if (PSP_Upsell_Coupons::validate_generated($coupon, $channel)) {
                    $validated[] = $code;
                }
            }
        }
        usort($notices, function ($a, $b) {
            if ($a['kind'] !== $b['kind']) {
                return $a['kind'] === 'applied' ? -1 : 1;
            }
            return $b['amount'] <=> $a['amount'];
        });

        return array(
            'channel'             => $channel,
            'rules_version'       => $state['rules_version'] ?: PSP_Upsell_Rules::version(),
            'eligible_offers'     => $eligible,
            'applied_auto_coupons' => $auto,
            'cart_notices'        => $notices,
            'missing_qualifiers'  => $missing,
            'line_item_discounts' => self::line_discounts($locale),
            'validated_coupons'   => $validated,
        );
    }

    /** Product-page offers for banners: [ [rule, side, text, cta_path] ]. */
    public static function product_offers($product_id, $channel, $locale = 'en') {
        $product_id = (int) $product_id;
        if (!$product_id || !$channel) {
            return array();
        }
        $product = wc_get_product($product_id);
        if ($product instanceof WC_Product && $product->get_parent_id()) {
            $product_id = (int) $product->get_parent_id();
        }
        $out = array();
        foreach (PSP_Upsell_Rules::get_active($channel) as $rule) {
            if (self::product_matches_trigger($product_id, $rule)) {
                $out[] = array(
                    'rule'     => $rule,
                    'side'     => 'trigger',
                    'text'     => PSP_Upsell_Rules::notice_text($rule, 'product_trigger', $locale),
                    'cta_path' => $rule['cta'][$channel]['trigger_side'],
                );
            } elseif (self::product_matches_target($product_id, $rule)) {
                $out[] = array(
                    'rule'     => $rule,
                    'side'     => 'target',
                    'text'     => PSP_Upsell_Rules::notice_text($rule, 'product_target', $locale),
                    'cta_path' => $rule['cta'][$channel]['target_side'],
                );
            }
        }
        return $out;
    }
}
