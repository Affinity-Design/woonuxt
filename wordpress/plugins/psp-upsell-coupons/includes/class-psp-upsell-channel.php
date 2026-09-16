<?php
/**
 * Which storefront is talking to us, and where its CTA links go.
 *
 * Detection mirrors psp_master_gateway_logic() in the master snippet: the
 * headless .ca sends X-Frontend-Type: woonuxt / a WooNuxt UA / GraphQL /
 * Store API; everything else on the public site is the classic .com store.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Channel {

    /** @var string|null explicit override (REST evaluate, WP-CLI tools) */
    private static $forced = null;

    public static function force($channel) {
        self::$forced = in_array($channel, PSP_Upsell_Rules::CHANNELS, true) ? $channel : null;
    }

    /** @return string|null 'ca' | 'com' | null (no storefront context) */
    public static function current() {
        if (self::$forced !== null) {
            return self::$forced;
        }
        $channel = null;

        $is_cli = defined('WP_CLI') && WP_CLI;
        $is_cron = function_exists('wp_doing_cron') && wp_doing_cron();
        $is_admin = is_admin() && !(function_exists('wp_doing_ajax') && wp_doing_ajax());

        if (!$is_cli && !$is_cron && !$is_admin) {
            $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
            $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
            $is_headless =
                (isset($_SERVER['HTTP_X_FRONTEND_TYPE']) && $_SERVER['HTTP_X_FRONTEND_TYPE'] === 'woonuxt') ||
                (defined('GRAPHQL_REQUEST') && GRAPHQL_REQUEST) ||
                (strpos($ua, 'WooNuxt') !== false) ||
                (strpos($uri, '/wp-json/wc/store/') !== false);

            if ($is_headless) {
                $channel = 'ca';
            } elseif (defined('REST_REQUEST') && REST_REQUEST) {
                $channel = null; // wc/v3, wp/v2 etc.: no cart evaluation
            } else {
                $channel = 'com';
            }
        }

        return apply_filters('psp_upsell_channel', $channel);
    }

    /**
     * @param array  $rule    compiled rule (selectors resolved)
     * @param string $side    'trigger_side' = link shown to a shopper on the trigger side (→ target listing);
     *                        'target_side'  = link shown on the target side (→ trigger listing)
     * @param string $channel 'ca' | 'com'
     */
    public static function cta_path(array $rule, $side, $channel) {
        $dest = $side === 'trigger_side' ? $rule['target'] : $rule['trigger'];
        if ($side === 'trigger_side') {
            $override = $rule['cta_overrides'][$channel . '_path'] ?? null;
            if (is_string($override) && $override !== '') {
                return $override;
            }
        }

        $cat = null;
        $brand = null;
        foreach ($dest['selectors'] as $sel) {
            if ($sel['taxonomy'] === 'product_cat' && !$cat && !empty($sel['terms'])) {
                $cat = $sel['terms'][0];
            } elseif (in_array($sel['taxonomy'], array('pa_manufacturer', 'pwb-brand'), true) && !$brand && !empty($sel['terms'])) {
                $brand = array('taxonomy' => $sel['taxonomy'], 'term' => $sel['terms'][0]);
            }
        }

        if ($channel === 'ca') {
            $filter = ($brand && $brand['taxonomy'] === 'pa_manufacturer') ? '?filter=pa_manufacturer[' . rawurlencode($brand['term']['slug']) . ']' : '';
            if ($cat) {
                return '/product-category/' . rawurlencode($cat['slug']) . $filter;
            }
            return '/products' . $filter;
        }

        // .com — use WordPress's real permalinks (category base differs from the .ca).
        if ($cat) {
            $link = get_term_link((int) $cat['id'], 'product_cat');
            $path = is_wp_error($link) ? '/product-category/' . rawurlencode($cat['slug']) . '/' : self::to_path($link);
            if ($brand && $brand['taxonomy'] === 'pa_manufacturer') {
                $path = add_query_arg('filter_manufacturer', $brand['term']['slug'], $path);
            }
            return $path;
        }
        if ($brand) {
            $link = get_term_link((int) $brand['term']['id'], $brand['taxonomy']);
            if (!is_wp_error($link)) {
                return self::to_path($link);
            }
        }
        $shop = function_exists('wc_get_page_id') ? get_permalink(wc_get_page_id('shop')) : '';
        return $shop ? self::to_path($shop) : '/shop/';
    }

    private static function to_path($url) {
        $parts = wp_parse_url($url);
        $path = isset($parts['path']) && $parts['path'] !== '' ? $parts['path'] : '/';
        if (!empty($parts['query'])) {
            $path .= '?' . $parts['query'];
        }
        return $path;
    }

    public static function site_url_for($channel, $path) {
        if ($channel === 'ca') {
            $base = apply_filters('psp_upsell_ca_base_url', 'https://proskatersplace.ca');
            return rtrim($base, '/') . $path;
        }
        return home_url($path);
    }
}
