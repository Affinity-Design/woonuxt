<?php
/**
 * Page-cache invalidation for the classic storefront.
 *
 * proskatersplace.com serves product and category pages from FlyingPress
 * (wp-content/advanced-cache.php), so the banners PSP_Upsell_Frontend renders only change
 * when that cache is purged. Purge it whenever the compiled rule set changes (rule saved,
 * paused, deleted, plugin activated). Cart and checkout are never page-cached.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Cache {

    public static function init() {
        add_action('psp_upsell_rules_compiled', array(__CLASS__, 'purge_page_cache'), 10, 1);
    }

    /**
     * @param array|null $payload the compiled rule payload (version, compiled_at, rules)
     * @return bool whether a page cache was actually purged
     */
    public static function purge_page_cache($payload = null) {
        if (!apply_filters('psp_upsell_purge_page_cache', true, $payload)) {
            return false;
        }
        $purged = false;
        try {
            if (class_exists('\FlyingPress\Purge') && method_exists('\FlyingPress\Purge', 'purge_pages')) {
                \FlyingPress\Purge::purge_pages();
                $purged = true;
            }
        } catch (\Throwable $e) {
            error_log('[psp-upsell] page cache purge failed: ' . $e->getMessage());
        }
        do_action('psp_upsell_page_cache_purged', $purged, $payload);
        return $purged;
    }
}
