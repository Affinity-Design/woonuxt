<?php
/**
 * Backend smoke test — run on the TEST site:
 *
 *   wp eval-file wp-content/plugins/psp-upsell-coupons/tools/smoke.php <trigger_product_id> <target_product_id> [unrelated_product_id] [channel=com]
 *
 * Requires an ACTIVE rule whose trigger matches the first product and whose
 * target matches the second. Asserts: no coupon with target alone; exactly
 * one UPSELL-* coupon once the trigger is added (stable across repeated
 * totals calculations — the recursion guard); discount == percent × target
 * subtotal only; unrelated line untouched; coupon gone after trigger removal.
 */

if (!defined('WP_CLI') || !WP_CLI) {
    echo "Run via: wp eval-file tools/smoke.php <trigger_id> <target_id> [unrelated_id] [channel]\n";
    return;
}

$trigger_id = isset($args[0]) ? (int) $args[0] : 0;
$target_id = isset($args[1]) ? (int) $args[1] : 0;
$unrelated_id = isset($args[2]) ? (int) $args[2] : 0;
$channel = isset($args[3]) ? (string) $args[3] : 'com';

if (!$trigger_id || !$target_id) {
    WP_CLI::error('Usage: smoke.php <trigger_product_id> <target_product_id> [unrelated_product_id] [channel]');
}

$fail = function ($msg) { WP_CLI::error('FAIL: ' . $msg); };
$pass = function ($msg) { WP_CLI::log('PASS: ' . $msg); };

wc_load_cart();
PSP_Upsell_Channel::force($channel);
$cart = WC()->cart;
$cart->empty_cart();

$generated = function () use ($cart) {
    return array_values(array_filter($cart->get_applied_coupons(), array('PSP_Upsell_Coupons', 'is_generated_code')));
};

$rules = PSP_Upsell_Rules::get_active($channel);
if (empty($rules)) {
    $fail("no active rules for channel {$channel}");
}
$rule = null;
foreach ($rules as $candidate) {
    if (PSP_Upsell_Engine::product_matches_trigger($trigger_id, $candidate) && PSP_Upsell_Engine::product_matches_target($target_id, $candidate)) {
        $rule = $candidate;
        break;
    }
}
if (!$rule) {
    $fail("no active rule has trigger→target matching products {$trigger_id} → {$target_id}");
}
WP_CLI::log(sprintf('Using rule #%d "%s" (%s)', $rule['id'], $rule['name'], $rule['discount']['display']));

// 1. target only → nothing
$target_key = $cart->add_to_cart($target_id, 1);
if (!$target_key) { $fail('could not add target product'); }
$cart->calculate_totals();
if ($generated()) { $fail('coupon applied with target only'); }
$pass('target alone: no coupon');

// 2. + trigger → exactly one coupon, stable across recalcs
$trigger_key = $cart->add_to_cart($trigger_id, 1);
if (!$trigger_key) { $fail('could not add trigger product'); }
$cart->calculate_totals();
$cart->calculate_totals();
$codes = $generated();
if (count($codes) !== 1) { $fail('expected exactly 1 generated coupon, got ' . count($codes) . ' (' . implode(',', $codes) . ')'); }
$code = $codes[0];
$pass("trigger + target: one coupon ({$code}), stable across two totals calculations");

// 3. discount isolation
if ($unrelated_id) {
    $unrelated_key = $cart->add_to_cart($unrelated_id, 1);
    if (!$unrelated_key) { $fail('could not add unrelated product'); }
    $cart->calculate_totals();
}
$items = $cart->get_cart();
$pct = (float) $rule['discount']['amount'];
$expected = round((float) $items[$target_key]['line_subtotal'] * $pct / 100, wc_get_price_decimals());
$actual = round((float) $cart->get_coupon_discount_amount($code, true), wc_get_price_decimals());
if (abs($expected - $actual) > 0.011) { $fail("discount {$actual} != expected {$expected} ({$pct}% of target subtotal)"); }
$pass("discount {$actual} == {$pct}% × target subtotal");

if ((float) $items[$trigger_key]['line_total'] < (float) $items[$trigger_key]['line_subtotal'] - 0.001) { $fail('trigger line was discounted'); }
$pass('trigger line untouched');
if ($unrelated_id && (float) $items[$unrelated_key]['line_total'] < (float) $items[$unrelated_key]['line_subtotal'] - 0.001) { $fail('unrelated line was discounted'); }
if ($unrelated_id) { $pass('unrelated line untouched'); }

$state = PSP_Upsell_Engine::public_state('en');
if (empty($state['line_item_discounts']) || $state['line_item_discounts'][0]['cart_item_key'] !== $target_key) { $fail('line_item_discounts missing the target line'); }
$pass('line_item_discounts reports the target line');

// 4. remove trigger → coupon gone
$cart->remove_cart_item($trigger_key);
$cart->calculate_totals();
if ($generated()) { $fail('coupon still applied after trigger removed'); }
$pass('trigger removed: coupon gone');

$cart->empty_cart();
WP_CLI::success('smoke test passed');
