<?php
/**
 * Rows inside the checkout review table (before cart contents).
 * Variables: $lines = [ ['cart_item_key','rule_id','coupon_code','amount','label','item_name'] ]
 * Override: <theme>/psp-upsell/checkout-breakdown.php
 */
if (!defined('ABSPATH')) {
    exit;
}
$total = 0.0;
?>
<?php foreach ($lines as $line) : $total += (float) $line['amount']; ?>
    <tr class="psp-upsell-breakdown">
        <td class="product-name">
            <span class="psp-upsell-breakdown__label"><?php echo esc_html($line['label']); ?></span>
            <?php if (!empty($line['item_name'])) : ?>
                <span class="psp-upsell-breakdown__item">&mdash; <?php echo esc_html($line['item_name']); ?></span>
            <?php endif; ?>
        </td>
        <td class="product-total psp-upsell-breakdown__amount">&minus;<?php echo wc_price($line['amount']); // phpcs:ignore WordPress.Security.EscapeOutput ?></td>
    </tr>
<?php endforeach; ?>
<?php if (count($lines) > 1) : ?>
    <tr class="psp-upsell-breakdown psp-upsell-breakdown--total">
        <td class="product-name"><?php esc_html_e('Bundle savings total', 'psp-upsell-coupons'); ?></td>
        <td class="product-total psp-upsell-breakdown__amount">&minus;<?php echo wc_price($total); // phpcs:ignore WordPress.Security.EscapeOutput ?></td>
    </tr>
<?php endif; ?>
