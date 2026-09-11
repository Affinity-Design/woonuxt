<?php
/**
 * Product page banner(s). Variables: $offers = [ ['rule','side','text','cta_path'] ]
 * Override: <theme>/psp-upsell/product-banner.php
 */
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="psp-upsell-banners">
    <?php foreach ($offers as $offer) : ?>
        <div class="psp-upsell-banner psp-upsell-banner--<?php echo esc_attr($offer['side']); ?>" data-rule="<?php echo esc_attr($offer['rule']['id']); ?>">
            <span class="psp-upsell-banner__badge"><?php echo esc_html($offer['rule']['discount']['display']); ?></span>
            <span class="psp-upsell-banner__text"><?php echo esc_html($offer['text']); ?></span>
            <a class="psp-upsell-banner__cta" href="<?php echo esc_url($offer['cta_path']); ?>">
                <?php echo esc_html(sprintf(__('Shop %s', 'psp-upsell-coupons'), $offer['side'] === 'trigger' ? $offer['rule']['target']['label'] : $offer['rule']['trigger']['label'])); ?> &rarr;
            </a>
        </div>
    <?php endforeach; ?>
</div>
