<?php
/**
 * Plugin Name:       PSP Cross-Domain Hreflang (.com ↔ .ca)
 * Description:       Emits reciprocal en-us / en-ca / x-default hreflang between proskatersplace.com and proskatersplace.ca on the homepage, product pages, and product-category archives. Completes the cluster whose .ca half is emitted by the WooNuxt frontend (useCanadianSEO). Rank Math compatible — Rank Math does not output hreflang, so there is no overlap; the translation plugin's en/fr/es tags use different hreflang values and are left untouched.
 * Version:           1.0.0
 * Author:            Affinity Design
 * Requires at least: 6.0
 * Requires PHP:      7.4
 *
 * INSTALL: drop this file into wp-content/plugins/ and activate ("PSP
 * Cross-Domain Hreflang"), or paste everything below the header into a new
 * Code Snippets snippet (run everywhere, priority default).
 *
 * URL mapping (same WP taxonomy backs both stores, slugs are shared):
 *   .com /shop/<cat>/<subcat>/<slug>/            ↔ .ca /product/<slug>/
 *   .com /products/<parent>/<child>/             ↔ .ca /product-category/<child>/
 *   .com /                                       ↔ .ca /
 *
 * Reciprocity: Google ignores hreflang without return tags. The .ca side
 * (woonuxt useCanadianSEO.ts, shipped 2026-07) emits en-ca self + en-us +
 * x-default pointing at the REAL .com URLs (product.link / category map).
 * This plugin is the .com return half. Deploy both sides close together.
 *
 * x-default deliberately points at the .com on both sides — routes
 * rest-of-world preference to the US store.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('wp_head', 'psp_hreflang_output', 1);

function psp_hreflang_output() {
    if (!apply_filters('psp_hreflang_enabled', true)) {
        return;
    }

    // Only clean, indexable page-1 URLs get hreflang. Paginated/filtered
    // variants have no 1:1 .ca equivalent (and currently canonical to page 1).
    if (is_paged() || is_search() || is_404()) {
        return;
    }

    $ca_url = psp_hreflang_ca_equivalent();
    if (!$ca_url) {
        return;
    }

    // Normalize the .com self URL so staging (test.proskatersplace.com)
    // emits exactly what production will — test must never enter the cluster.
    $us_url = psp_hreflang_normalize_host(psp_hreflang_current_url());
    if (!$us_url) {
        return;
    }

    printf('<link rel="alternate" hreflang="en-us" href="%s" />' . "\n", esc_url($us_url));
    printf('<link rel="alternate" hreflang="en-ca" href="%s" />' . "\n", esc_url($ca_url));
    printf('<link rel="alternate" hreflang="x-default" href="%s" />' . "\n", esc_url($us_url));
}

/**
 * The proskatersplace.ca equivalent of the current page, or null when no
 * deterministic 1:1 equivalent exists (brand archives, blog posts, cart...).
 */
function psp_hreflang_ca_equivalent() {
    $ca_base = 'https://proskatersplace.ca';

    if (is_front_page()) {
        return $ca_base . '/';
    }

    // Product pages: .ca serves every product at /product/<slug>/
    if (function_exists('is_product') && is_product()) {
        $post = get_queried_object();
        if ($post instanceof WP_Post && $post->post_name) {
            return $ca_base . '/product/' . $post->post_name . '/';
        }
        return null;
    }

    // Product-category archives: .ca uses the flat deepest-term slug
    if (is_tax('product_cat')) {
        $term = get_queried_object();
        if ($term instanceof WP_Term && $term->slug) {
            return $ca_base . '/product-category/' . $term->slug . '/';
        }
        return null;
    }

    return null;
}

/**
 * Canonical URL of the current page on .com (permalink-based, query-free).
 */
function psp_hreflang_current_url() {
    if (is_front_page()) {
        return home_url('/');
    }
    $obj = get_queried_object();
    if ($obj instanceof WP_Post) {
        return get_permalink($obj);
    }
    if ($obj instanceof WP_Term) {
        $link = get_term_link($obj);
        return is_wp_error($link) ? null : $link;
    }
    return null;
}

/**
 * Force the production .com host (staging/test/www → proskatersplace.com).
 */
function psp_hreflang_normalize_host($url) {
    if (!$url) {
        return null;
    }
    return preg_replace(
        '#^https?://(?:test\.|www\.)?proskatersplace\.com#',
        'https://proskatersplace.com',
        $url
    );
}
