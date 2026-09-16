<?php
/**
 * wp-admin: keep generated UPSELL-* coupons out of the everyday coupon list.
 *
 * Marketing → Coupons hides them by default (they are session-bound, single-use and
 * purged by cron, so nobody manages them by hand) and gains an "Upsell auto-coupons"
 * view that lists only them. Searching by code works in both views.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Admin {

    const QUERY_VAR = 'psp_upsell';

    public static function init() {
        if (!is_admin()) {
            return;
        }
        add_action('pre_get_posts', array(__CLASS__, 'filter_coupon_list'));
        add_filter('views_edit-shop_coupon', array(__CLASS__, 'views'));
    }

    private static function is_coupon_list(WP_Query $query) {
        if (!$query->is_main_query() || $query->get('post_type') !== 'shop_coupon') {
            return false;
        }
        if (function_exists('get_current_screen')) {
            $screen = get_current_screen();
            if ($screen && $screen->id !== 'edit-shop_coupon') {
                return false;
            }
        }
        return true;
    }

    private static function showing_generated() {
        return !empty($_GET[self::QUERY_VAR]); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only list filter
    }

    public static function filter_coupon_list(WP_Query $query) {
        if (!self::is_coupon_list($query)) {
            return;
        }
        $meta_query = (array) $query->get('meta_query');
        $meta_query[] = array(
            'key'     => PSP_Upsell_Coupons::META_RULE_ID,
            'compare' => self::showing_generated() ? 'EXISTS' : 'NOT EXISTS',
        );
        $query->set('meta_query', $meta_query);
    }

    public static function views($views) {
        $generated = self::count_generated();

        // "All" counts every coupon; take the hidden generated ones out of that number.
        if ($generated > 0 && isset($views['all'])) {
            $views['all'] = preg_replace_callback(
                '/<span class="count">\((\d[\d,]*)\)<\/span>/',
                function ($m) use ($generated) {
                    $n = max(0, (int) str_replace(',', '', $m[1]) - $generated);
                    return '<span class="count">(' . number_format_i18n($n) . ')</span>';
                },
                $views['all'],
                1
            );
        }
        if (self::showing_generated() && isset($views['all'])) {
            $views['all'] = str_replace(array(' class="current"', ' aria-current="page"'), '', $views['all']);
        }

        $url = add_query_arg(array('post_type' => 'shop_coupon', self::QUERY_VAR => 1), admin_url('edit.php'));
        $views[self::QUERY_VAR] = sprintf(
            '<a href="%s"%s>%s <span class="count">(%s)</span></a>',
            esc_url($url),
            self::showing_generated() ? ' class="current" aria-current="page"' : '',
            esc_html__('Upsell auto-coupons', 'psp-upsell-coupons'),
            number_format_i18n($generated)
        );
        return $views;
    }

    private static function count_generated() {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
             WHERE p.post_type = 'shop_coupon' AND p.post_status NOT IN ('trash', 'auto-draft')",
            PSP_Upsell_Coupons::META_RULE_ID
        ));
    }
}
