<?php
/**
 * PSP Category Archive SEO Child Theme Reference
 *
 * Reference implementation for a WordPress child theme.
 * This file is not auto-loaded by the repo; copy the relevant parts into the
 * child theme's functions.php or an included theme helper file.
 *
 * Purpose:
 * - render product category intro and below-content from existing term data
 * - expose consistent helpers for category SEO title/description/image
 * - emit FAQ schema only when the FAQ block is also rendered on-page
 */

if (!defined('ABSPATH')) {
    return;
}

// Static-analysis helpers for this repo workspace. These do not execute in WordPress.
if (false) {
    function is_product_category() {}
    function get_queried_object() {}
    function is_wp_error($value) {}
    function term_description($term = null, $taxonomy = null) {}
    function get_term_meta($term_id, $key = '', $single = false) {}
    function wp_strip_all_tags($text, $remove_breaks = false) {}
    function wp_trim_words($text, $num_words = 55, $more = null) {}
    function wp_get_attachment_image_url($attachment_id, $size = 'thumbnail', $icon = false) {}
    function wp_kses_post($data) {}
    function get_term_link($term, $taxonomy = '') {}
    function esc_attr($text) {}
    function esc_url($url, $protocols = null, $_context = 'display') {}
    function wp_json_encode($value, $flags = 0, $depth = 512) {}
}

if (!function_exists('psp_child_theme_get_product_cat_term')) {
    function psp_child_theme_get_product_cat_term() {
        if (!is_product_category()) {
            return null;
        }

        $term = get_queried_object();
        return ($term && !is_wp_error($term) && !empty($term->term_id)) ? $term : null;
    }
}

if (!function_exists('psp_child_theme_get_category_intro_html')) {
    function psp_child_theme_get_category_intro_html($term) {
        if (!$term) {
            return '';
        }

        return term_description($term, 'product_cat') ?: '';
    }
}

if (!function_exists('psp_child_theme_get_category_below_content_html')) {
    function psp_child_theme_get_category_below_content_html($term_id) {
        foreach (['below_category_content', 'second_desc', 'seconddesc', 'cat_second_desc', 'bottom_description'] as $key) {
            $value = get_term_meta($term_id, $key, true);
            if (is_string($value) && trim($value) !== '') {
                return $value;
            }
        }

        return '';
    }
}

if (!function_exists('psp_child_theme_get_category_seo_title')) {
    function psp_child_theme_get_category_seo_title($term) {
        if (!$term) {
            return '';
        }

        $custom = trim((string) get_term_meta($term->term_id, 'rank_math_title', true));
        return $custom !== '' ? $custom : $term->name;
    }
}

if (!function_exists('psp_child_theme_get_category_seo_description')) {
    function psp_child_theme_get_category_seo_description($term) {
        if (!$term) {
            return '';
        }

        $custom = trim((string) get_term_meta($term->term_id, 'rank_math_description', true));
        if ($custom !== '') {
            return $custom;
        }

        $intro = wp_strip_all_tags(term_description($term, 'product_cat'));
        return $intro !== '' ? wp_trim_words($intro, 30, '') : '';
    }
}

if (!function_exists('psp_child_theme_get_category_image_url')) {
    function psp_child_theme_get_category_image_url($term_id, $size = 'full') {
        $thumbnail_id = get_term_meta($term_id, 'thumbnail_id', true);
        if (!$thumbnail_id) {
            return '';
        }

        $image = wp_get_attachment_image_url((int) $thumbnail_id, $size);
        return $image ?: '';
    }
}

if (!function_exists('psp_child_theme_get_category_faq_schema')) {
    function psp_child_theme_get_category_faq_schema($term_id) {
        $raw = (string) get_term_meta($term_id, 'psp_cat_schema', true);
        if (trim($raw) === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}

/**
 * Example: manually render intro near the top of the archive if the theme suppresses term_description().
 */
if (!function_exists('psp_child_theme_render_category_intro')) {
    function psp_child_theme_render_category_intro() {
        $term = psp_child_theme_get_product_cat_term();
        $intro = (string) psp_child_theme_get_category_intro_html($term);

        if (!$term || trim((string) wp_strip_all_tags($intro)) === '') {
            return;
        }

        echo '<div class="psp-category-intro">' . wp_kses_post($intro) . '</div>';
    }
}

/**
 * Example: render below-grid content after the loop/pagination area.
 */
if (!function_exists('psp_child_theme_render_category_below_content')) {
    function psp_child_theme_render_category_below_content() {
        $term = psp_child_theme_get_product_cat_term();
        if (!$term) {
            return;
        }

        $content = (string) psp_child_theme_get_category_below_content_html($term->term_id);
        if (trim((string) wp_strip_all_tags($content)) === '') {
            return;
        }

        echo '<section class="psp-category-below-content">' . wp_kses_post($content) . '</section>';
    }
}

/**
 * Example: emit fallback archive meta if the theme/plugin is not outputting it.
 * Adapt carefully if Rank Math is already handling these tags elsewhere.
 */
if (!function_exists('psp_child_theme_output_category_archive_meta')) {
    function psp_child_theme_output_category_archive_meta() {
        $term = psp_child_theme_get_product_cat_term();
        if (!$term) {
            return;
        }

        $description = psp_child_theme_get_category_seo_description($term);
        $image = psp_child_theme_get_category_image_url($term->term_id);
        $url = get_term_link($term, 'product_cat');

        if ($description !== '') {
            echo "\n<meta name=\"description\" content=\"" . esc_attr($description) . "\" />\n";
            echo "<meta property=\"og:description\" content=\"" . esc_attr($description) . "\" />\n";
            echo "<meta name=\"twitter:description\" content=\"" . esc_attr($description) . "\" />\n";
        }

        echo "<meta property=\"og:type\" content=\"website\" />\n";

        if ($url && !is_wp_error($url)) {
            echo "<meta property=\"og:url\" content=\"" . esc_url($url) . "\" />\n";
        }

        if ($image !== '') {
            echo "<meta property=\"og:image\" content=\"" . esc_url($image) . "\" />\n";
            echo "<meta name=\"twitter:image\" content=\"" . esc_url($image) . "\" />\n";
        }
    }
}

/**
 * Example: emit FAQ schema only when FAQ markup is visible on the page.
 * If the below-content block already includes the visible FAQ, this can stay enabled.
 */
if (!function_exists('psp_child_theme_output_category_faq_schema')) {
    function psp_child_theme_output_category_faq_schema() {
        $term = psp_child_theme_get_product_cat_term();
        if (!$term) {
            return;
        }

        $content = psp_child_theme_get_category_below_content_html($term->term_id);
        if (stripos($content, 'Frequently Asked Questions') === false) {
            return;
        }

        $schema = psp_child_theme_get_category_faq_schema($term->term_id);
        if (!$schema) {
            return;
        }

        echo "\n<script type=\"application/ld+json\">\n";
        echo wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        echo "\n</script>\n";
    }
}

/*
Suggested hooks to adapt in the child theme:

add_action('woocommerce_archive_description', 'psp_child_theme_render_category_intro', 5);
add_action('woocommerce_after_shop_loop', 'psp_child_theme_render_category_below_content', 20);
add_action('wp_head', 'psp_child_theme_output_category_archive_meta', 1);
add_action('wp_head', 'psp_child_theme_output_category_faq_schema', 20);

Only keep the hooks that do not conflict with the active theme/plugin stack.
*/