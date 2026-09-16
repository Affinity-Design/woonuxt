<?php
/**
 * Inner HTML of one cart notice (printed through wc_print_notice).
 * Variables: $notice = ['rule_id','kind','text','cta_path']
 * Override: <theme>/psp-upsell/cart-notice.php
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<span class="psp-upsell-notice psp-upsell-notice--<?php echo esc_attr($notice['kind']); ?>" data-rule="<?php echo esc_attr($notice['rule_id']); ?>">
    <span class="psp-upsell-notice__text"><?php echo esc_html($notice['text']); ?></span>
    <?php if (!empty($notice['cta_path'])) : ?>
        <a class="button psp-upsell-notice__cta" href="<?php echo esc_url($notice['cta_path']); ?>"><?php esc_html_e('Shop now', 'psp-upsell-coupons'); ?></a>
    <?php endif; ?>
</span>
