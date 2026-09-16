<?php
/**
 * Order-side bookkeeping: retire generated coupons, record which rule applied.
 *
 * Native checkout carries the coupon in coupon_lines (WooCommerce increments
 * usage itself). Headless .ca orders are created by the admin API with
 * pre-discounted line totals and never re-apply coupons, so the frontend
 * passes the codes as _psp_upsell_coupons meta and we consume them here.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Orders {

    const META_CODES = '_psp_upsell_coupons';
    const META_APPLIED = '_psp_upsell_applied';
    const ITEM_META_DISCOUNT = '_psp_upsell_discount';
    const ITEM_META_COUPON = '_psp_upsell_coupon';

    public static function init() {
        add_action('woocommerce_checkout_order_processed', array(__CLASS__, 'consume'), 20, 1);
        add_action('woocommerce_payment_complete', array(__CLASS__, 'consume'), 20, 1);
        add_action('woocommerce_order_status_processing', array(__CLASS__, 'consume'), 20, 1);
        add_action('woocommerce_order_status_on-hold', array(__CLASS__, 'consume'), 20, 1);
        add_action('woocommerce_order_status_completed', array(__CLASS__, 'consume'), 20, 1);
    }

    public static function consume($order_id) {
        $order = wc_get_order($order_id);
        if (!$order instanceof WC_Order) {
            return;
        }
        if ($order->get_meta(self::META_APPLIED)) {
            return;
        }

        $codes = array();
        foreach ($order->get_coupon_codes() as $code) {
            if (PSP_Upsell_Coupons::is_generated_code($code)) {
                $codes[strtolower($code)] = 'native';
            }
        }
        $meta = $order->get_meta(self::META_CODES);
        $meta_codes = is_string($meta) ? json_decode($meta, true) : $meta;
        foreach ((array) $meta_codes as $code) {
            if (is_string($code) && PSP_Upsell_Coupons::is_generated_code($code) && !isset($codes[strtolower($code)])) {
                $codes[strtolower($code)] = 'headless';
            }
        }
        if (empty($codes)) {
            return;
        }

        $applied = array();
        foreach ($codes as $code => $source) {
            $coupon = new WC_Coupon($code);
            if (!$coupon->get_id() || !PSP_Upsell_Coupons::is_generated($coupon)) {
                continue;
            }
            $rule_id = (int) $coupon->get_meta(PSP_Upsell_Coupons::META_RULE_ID);
            $rule = PSP_Upsell_Rules::get($rule_id);
            $rule_name = $rule ? $rule['name'] : ('#' . $rule_id);

            if ($source === 'headless') {
                $coupon->increase_usage_count($order->get_billing_email() ? $order->get_billing_email() : '');
            }
            PSP_Upsell_Coupons::retire($coupon, $order->get_id());

            $discount = 0.0;
            $lines = array();
            if ($source === 'native') {
                foreach ($order->get_items('coupon') as $coupon_item) {
                    if (strtolower($coupon_item->get_code()) === $code) {
                        $discount += (float) $coupon_item->get_discount() + (float) $coupon_item->get_discount_tax();
                    }
                }
            }
            foreach ($order->get_items('line_item') as $item_id => $item) {
                $item_code = strtolower((string) $item->get_meta(self::ITEM_META_COUPON));
                $item_discount = (float) $item->get_meta(self::ITEM_META_DISCOUNT);
                if ($item_code === $code && $item_discount > 0) {
                    $lines[$item_id] = $item_discount;
                    if ($source === 'headless') {
                        $discount += $item_discount;
                    }
                }
            }

            $note = sprintf(
                'Upsell rule "%s" applied — code %s (%s)%s.',
                $rule_name,
                strtoupper($code),
                $source === 'native' ? 'checkout' : 'headless order',
                $discount > 0 ? ' — discount ' . wp_strip_all_tags(wc_price($discount, array('currency' => $order->get_currency()))) : ''
            );
            $order->add_order_note($note);

            $applied[] = array(
                'rule_id'        => $rule_id,
                'rule_name'      => $rule_name,
                'code'           => strtoupper($code),
                'source'         => $source,
                'discount_total' => wc_format_decimal($discount, wc_get_price_decimals()),
                'lines'          => $lines,
            );
        }

        if (!empty($applied)) {
            $order->update_meta_data(self::META_APPLIED, wp_json_encode($applied));
            $order->save();
            do_action('psp_upsell_order_consumed', $order, $applied);
        }
    }
}
