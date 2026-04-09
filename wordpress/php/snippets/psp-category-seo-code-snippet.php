<?php
/**
 * PSP Category SEO Bridge
 *
 * Paste this into the WordPress Code Snippets plugin and set it to run everywhere.
 * If Code Snippets rejects the opening <?php tag, remove only the first line.
 *
 * Purpose:
 * - expose WooCommerce product category meta fields to REST
 * - allow the category optimizer to write below-content, FAQ schema, and Rank Math fields
 * - emit FAQPage JSON-LD on category archives
 *
 * Connected fields:
 * - description (core WooCommerce category field via WC REST)
 * - below_category_content / second_desc / seconddesc / cat_second_desc / bottom_description
 * - psp_cat_schema
 * - rank_math_title
 * - rank_math_description
 * - rank_math_focus_keyword
 *
 * Safe with psp-old.php:
 * - psp-old.php only targets the pwb-brand taxonomy and /brand-* routes
 * - this snippet only targets product_cat and /category-* routes
 * - the load guard below prevents this bridge from double-loading if a mu-plugin copy is also active
 */

if (!defined('ABSPATH')) {
    return;
}

if (defined('PSP_CATEGORY_SEO_BRIDGE_LOADED')) {
    return;
}

define('PSP_CATEGORY_SEO_BRIDGE_LOADED', true);

if (!function_exists('psp_category_bridge_can_manage')) {
    function psp_category_bridge_can_manage() {
        return current_user_can('manage_woocommerce') || current_user_can('manage_options');
    }
}

if (!function_exists('psp_category_bridge_strlen')) {
    function psp_category_bridge_strlen($value) {
        return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    }
}

if (!function_exists('psp_category_bridge_substr')) {
    function psp_category_bridge_substr($value, $start, $length) {
        return function_exists('mb_substr') ? mb_substr($value, $start, $length) : substr($value, $start, $length);
    }
}

if (!function_exists('psp_category_bridge_below_fields')) {
    function psp_category_bridge_below_fields() {
        return ['below_category_content', 'second_desc', 'seconddesc', 'cat_second_desc', 'bottom_description'];
    }
}

if (!function_exists('psp_category_bridge_summary_value')) {
    function psp_category_bridge_summary_value($value) {
        if (!is_string($value)) {
            return $value;
        }

        return [
            'value' => psp_category_bridge_substr($value, 0, 300),
            'length' => psp_category_bridge_strlen($value),
        ];
    }
}

if (!function_exists('psp_category_bridge_shipping_copy')) {
    function psp_category_bridge_shipping_copy() {
        return (string) apply_filters('psp_category_shipping_copy', 'Free shipping available on qualifying US orders.');
    }
}

if (!shortcode_exists('psp_category_shipping_copy')) {
    add_shortcode('psp_category_shipping_copy', function () {
        return esc_html(psp_category_bridge_shipping_copy());
    });
}

add_action('init', function () {
    register_term_meta('product_cat', 'psp_cat_schema', [
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'sanitize_callback' => 'sanitize_textarea_field',
        'auth_callback' => 'psp_category_bridge_can_manage',
        'description' => 'FAQPage JSON-LD schema for category pages.',
    ]);

    foreach (psp_category_bridge_below_fields() as $field_key) {
        register_term_meta('product_cat', $field_key, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'sanitize_callback' => 'wp_kses_post',
            'auth_callback' => 'psp_category_bridge_can_manage',
            'description' => 'Below-products content field for product categories.',
        ]);
    }

    foreach (['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'] as $field_key) {
        register_term_meta('product_cat', $field_key, [
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback' => 'psp_category_bridge_can_manage',
            'description' => 'Rank Math term meta exposed for automation.',
        ]);
    }
});

add_action('wp_head', function () {
    if (!is_product_category()) {
        return;
    }

    $term = get_queried_object();
    if (!$term || empty($term->term_id)) {
        return;
    }

    $schema = get_term_meta($term->term_id, 'psp_cat_schema', true);
    if (empty($schema)) {
        return;
    }

    $decoded = json_decode($schema);
    if (!$decoded) {
        return;
    }

    echo "\n<script type=\"application/ld+json\">\n";
    echo wp_json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    echo "\n</script>\n";
}, 20);

add_action('rest_api_init', function () {
    register_rest_route('psp/v1', '/category-meta/(?P<id>\d+)', [
        'methods' => 'GET',
        'permission_callback' => 'psp_category_bridge_can_manage',
        'callback' => function (WP_REST_Request $request) {
            $term_id = (int) $request['id'];
            $term = get_term($term_id, 'product_cat');
            if (!$term || is_wp_error($term)) {
                return new WP_Error('invalid_term', 'Category term not found', ['status' => 404]);
            }

            $all_meta = get_term_meta($term_id);
            $summary = [];
            foreach ($all_meta as $key => $values) {
                $raw_value = count($values) === 1 ? $values[0] : $values;
                $summary[$key] = psp_category_bridge_summary_value($raw_value);
            }

            return rest_ensure_response([
                'term_id' => $term_id,
                'name' => $term->name,
                'slug' => $term->slug,
                'parent' => $term->parent,
                'count' => $term->count,
                'meta' => $summary,
            ]);
        },
    ]);

    register_rest_route('psp/v1', '/category-below-content/(?P<id>\d+)', [
        'methods' => 'POST',
        'permission_callback' => 'psp_category_bridge_can_manage',
        'callback' => function (WP_REST_Request $request) {
            $term_id = (int) $request['id'];
            $term = get_term($term_id, 'product_cat');
            if (!$term || is_wp_error($term)) {
                return new WP_Error('invalid_term', 'Category term not found', ['status' => 404]);
            }

            $content = (string) $request->get_param('content');
            $field = (string) ($request->get_param('field') ?: 'below_category_content');

            if (!in_array($field, psp_category_bridge_below_fields(), true)) {
                return new WP_Error('invalid_field', 'Field name not allowed', ['status' => 400]);
            }

            $sanitized = wp_kses_post($content);
            $updatedFields = [];

            foreach (psp_category_bridge_below_fields() as $targetField) {
                update_term_meta($term_id, $targetField, $sanitized);
                $updatedFields[] = $targetField;
            }

            return rest_ensure_response([
                'term_id' => $term_id,
                'field' => $field,
                'updated' => true,
                'updated_fields' => $updatedFields,
                'length' => psp_category_bridge_strlen($sanitized),
            ]);
        },
    ]);

    register_rest_route('psp/v1', '/category-seo/(?P<id>\d+)', [
        [
            'methods' => 'GET',
            'permission_callback' => 'psp_category_bridge_can_manage',
            'callback' => function (WP_REST_Request $request) {
                $term_id = (int) $request['id'];
                $term = get_term($term_id, 'product_cat');
                if (!$term || is_wp_error($term)) {
                    return new WP_Error('invalid_term', 'Category term not found', ['status' => 404]);
                }

                $payload = [
                    'term_id' => $term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                    'rank_math_title' => psp_category_bridge_summary_value((string) get_term_meta($term_id, 'rank_math_title', true)),
                    'rank_math_description' => psp_category_bridge_summary_value((string) get_term_meta($term_id, 'rank_math_description', true)),
                    'rank_math_focus_keyword' => psp_category_bridge_summary_value((string) get_term_meta($term_id, 'rank_math_focus_keyword', true)),
                    'psp_cat_schema' => psp_category_bridge_summary_value((string) get_term_meta($term_id, 'psp_cat_schema', true)),
                ];

                return rest_ensure_response($payload);
            },
        ],
        [
            'methods' => 'POST',
            'permission_callback' => 'psp_category_bridge_can_manage',
            'callback' => function (WP_REST_Request $request) {
                $term_id = (int) $request['id'];
                $term = get_term($term_id, 'product_cat');
                if (!$term || is_wp_error($term)) {
                    return new WP_Error('invalid_term', 'Category term not found', ['status' => 404]);
                }

                $updates = [];

                $title = $request->get_param('title');
                if ($title === null) {
                    $title = $request->get_param('rank_math_title');
                }
                if ($title !== null) {
                    $sanitized_title = sanitize_text_field((string) $title);
                    update_term_meta($term_id, 'rank_math_title', $sanitized_title);
                    $updates['rank_math_title'] = psp_category_bridge_summary_value($sanitized_title);
                }

                $description = $request->get_param('description');
                if ($description === null) {
                    $description = $request->get_param('rank_math_description');
                }
                if ($description !== null) {
                    $sanitized_description = sanitize_text_field((string) $description);
                    update_term_meta($term_id, 'rank_math_description', $sanitized_description);
                    $updates['rank_math_description'] = psp_category_bridge_summary_value($sanitized_description);
                }

                $focus_keyword = $request->get_param('focus_keyword');
                if ($focus_keyword === null) {
                    $focus_keyword = $request->get_param('rank_math_focus_keyword');
                }
                if ($focus_keyword !== null) {
                    $sanitized_focus_keyword = sanitize_text_field((string) $focus_keyword);
                    update_term_meta($term_id, 'rank_math_focus_keyword', $sanitized_focus_keyword);
                    $updates['rank_math_focus_keyword'] = psp_category_bridge_summary_value($sanitized_focus_keyword);
                }

                $schema = $request->get_param('schema');
                if ($schema === null) {
                    $schema = $request->get_param('psp_cat_schema');
                }
                if ($schema !== null) {
                    $sanitized_schema = sanitize_textarea_field((string) $schema);
                    update_term_meta($term_id, 'psp_cat_schema', $sanitized_schema);
                    $updates['psp_cat_schema'] = psp_category_bridge_summary_value($sanitized_schema);
                }

                return rest_ensure_response([
                    'term_id' => $term_id,
                    'updated' => $updates,
                ]);
            },
        ],
    ]);

    register_rest_route('psp/v1', '/category-meta/(?P<id>\d+)/(?P<key>[a-zA-Z0-9_-]+)', [
        'methods' => 'DELETE',
        'permission_callback' => 'psp_category_bridge_can_manage',
        'callback' => function (WP_REST_Request $request) {
            $term_id = (int) $request['id'];
            $key = sanitize_key($request['key']);
            $before = get_term_meta($term_id, $key, true);
            $deleted = delete_term_meta($term_id, $key);

            return rest_ensure_response([
                'deleted' => $deleted,
                'key' => $key,
                'had_value' => !empty($before),
                'value_length' => is_string($before) ? psp_category_bridge_strlen($before) : 0,
            ]);
        },
    ]);
});