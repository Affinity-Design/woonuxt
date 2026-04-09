<?php
/**
 * PSP Category Content Field
 *
 * Registers REST-accessible meta fields on the product_cat taxonomy
 * for SEO optimization scripts.
 *
 * Companion to: wordpress/scripts/optimize-category-page.js
 * Target site:  proskatersplace.com (US .com)
 *
 * Field layout:
 *   description         → short intro (80-120 words), renders ABOVE products (WC default)
 *   below_category_content / second_desc
 *                      → theme-specific fields used to render content BELOW products
 *   psp_cat_schema      → FAQPage JSON-LD (raw JSON), emitted in <head> via wp_head hook
 *   rank_math_*         → SEO meta fields (title, description, focus keyword)
 *
 * NOTE: Themes vary on which below-content field they render. This mu-plugin
 *       does NOT override frontend rendering — it only ensures REST API write
 *       access and adds schema/diagnostic endpoints.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

if ( defined( 'PSP_CATEGORY_SEO_BRIDGE_LOADED' ) ) {
    return;
}

define( 'PSP_CATEGORY_SEO_BRIDGE_LOADED', true );

if ( ! function_exists( 'psp_category_content_strlen' ) ) {
    function psp_category_content_strlen( $value ) {
        return function_exists( 'mb_strlen' ) ? mb_strlen( $value ) : strlen( $value );
    }
}

if ( ! function_exists( 'psp_category_content_substr' ) ) {
    function psp_category_content_substr( $value, $start, $length ) {
        return function_exists( 'mb_substr' ) ? mb_substr( $value, $start, $length ) : substr( $value, $start, $length );
    }
}

if ( ! function_exists( 'psp_category_content_shipping_copy' ) ) {
    function psp_category_content_shipping_copy() {
        return (string) apply_filters( 'psp_category_shipping_copy', 'Free shipping available on qualifying US orders.' );
    }
}

if ( ! shortcode_exists( 'psp_category_shipping_copy' ) ) {
    add_shortcode( 'psp_category_shipping_copy', function() {
        return esc_html( psp_category_content_shipping_copy() );
    } );
}

// ─── 1. Register meta fields with WP REST API ────────────────────────────────

add_action( 'init', function() {
    // --- PSP category schema field ---
    register_term_meta( 'product_cat', 'psp_cat_schema', [
        'show_in_rest'      => true,
        'single'            => true,
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_textarea_field',
        'auth_callback'     => function() {
            return current_user_can( 'manage_woocommerce' );
        },
        'description'       => 'FAQPage JSON-LD schema — emitted in wp_head on category archive pages.',
    ] );

    // --- Theme-specific below-content fields (ensure REST writability) ---
    foreach ( [ 'below_category_content', 'second_desc', 'seconddesc', 'cat_second_desc', 'bottom_description' ] as $key ) {
        register_term_meta( 'product_cat', $key, [
            'show_in_rest'      => true,
            'single'            => true,
            'type'              => 'string',
            'sanitize_callback' => 'wp_kses_post',
            'auth_callback'     => function() {
                return current_user_can( 'manage_woocommerce' );
            },
            'description'       => 'Below-products content exposed for category SEO automation.',
        ] );
    }

    // --- Rank Math SEO fields for product_cat ---
    // Rank Math may not register these with show_in_rest for product_cat.
    // Explicit registration ensures script can write via REST API.
    $rank_math_keys = [
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
    ];
    foreach ( $rank_math_keys as $key ) {
        register_term_meta( 'product_cat', $key, [
            'show_in_rest'      => true,
            'single'            => true,
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => function() {
                return current_user_can( 'manage_woocommerce' );
            },
        ] );
    }
} );

// ─── 2. Output FAQPage schema in <head> on category archive pages ─────────────

add_action( 'wp_head', function() {
    if ( ! is_product_category() ) return;

    $term = get_queried_object();
    if ( ! $term ) return;

    $schema = get_term_meta( $term->term_id, 'psp_cat_schema', true );
    if ( empty( $schema ) ) return;

    $decoded = json_decode( $schema );
    if ( ! $decoded ) return;

    echo "\n<script type=\"application/ld+json\">\n";
    echo wp_json_encode( $decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT );
    echo "\n</script>\n";
} );

// ─── 3. REST API: Category meta diagnostic & management ───────────────────────
//
// GET  /wp-json/psp/v1/category-meta/<term_id>              → all termmeta (debug)
// POST /wp-json/psp/v1/category-below-content/<term_id>     → write below-content field
// DELETE /wp-json/psp/v1/category-meta/<term_id>/<key>       → delete a specific key

add_action( 'rest_api_init', function() {

    // 3a. List ALL termmeta for a category term (diagnostic)
    register_rest_route( 'psp/v1', '/category-meta/(?P<id>\d+)', [
        'methods'             => 'GET',
        'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
        'callback'            => function( WP_REST_Request $request ) {
            $term_id = (int) $request['id'];
            $term    = get_term( $term_id, 'product_cat' );
            if ( ! $term || is_wp_error( $term ) ) {
                return new WP_Error( 'invalid_term', 'Category term not found', [ 'status' => 404 ] );
            }
            $all_meta = get_term_meta( $term_id );
            $summary  = [];
            foreach ( $all_meta as $key => $values ) {
                $val = count( $values ) === 1 ? $values[0] : $values;
                $summary[ $key ] = [
                    'value'  => is_string( $val ) ? mb_substr( $val, 0, 300 ) : $val,
                    'length' => is_string( $val ) ? mb_strlen( $val ) : null,
                ];
            }
            return rest_ensure_response( [
                'term_id' => $term_id,
                'name'    => $term->name,
                'slug'    => $term->slug,
                'parent'  => $term->parent,
                'count'   => $term->count,
                'meta'    => $summary,
            ] );
        },
    ] );

    // 3b. Write below-products content (handles Shoptimizer field detection)
    register_rest_route( 'psp/v1', '/category-below-content/(?P<id>\d+)', [
        'methods'             => 'POST',
        'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
        'callback'            => function( WP_REST_Request $request ) {
            $term_id = (int) $request['id'];
            $term    = get_term( $term_id, 'product_cat' );
            if ( ! $term || is_wp_error( $term ) ) {
                return new WP_Error( 'invalid_term', 'Category term not found', [ 'status' => 404 ] );
            }

            $content = $request->get_param( 'content' );
            $field   = $request->get_param( 'field' ) ?: 'below_category_content';

            // Validate field name (allow only known safe field names)
            $allowed_fields = [ 'below_category_content', 'second_desc', 'seconddesc', 'cat_second_desc', 'bottom_description' ];
            if ( ! in_array( $field, $allowed_fields, true ) ) {
                return new WP_Error( 'invalid_field', 'Field name not allowed', [ 'status' => 400 ] );
            }

            // Sanitize HTML content (allow safe tags)
            $sanitized = wp_kses_post( $content );

            // Keep all supported below-content fields in sync.
            $updated_fields = [];
            foreach ( $allowed_fields as $target_field ) {
                update_term_meta( $term_id, $target_field, $sanitized );
                $updated_fields[] = $target_field;
            }

            return rest_ensure_response( [
                'term_id'   => $term_id,
                'field'     => $field,
                'updated'   => true,
                'updated_fields' => $updated_fields,
                'length'    => psp_category_content_strlen( $sanitized ),
            ] );
        },
    ] );

    // 3c. Read/write category SEO-connected fields in one place
    register_rest_route( 'psp/v1', '/category-seo/(?P<id>\d+)', [
        [
            'methods'             => 'GET',
            'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
            'callback'            => function( WP_REST_Request $request ) {
                $term_id = (int) $request['id'];
                $term    = get_term( $term_id, 'product_cat' );
                if ( ! $term || is_wp_error( $term ) ) {
                    return new WP_Error( 'invalid_term', 'Category term not found', [ 'status' => 404 ] );
                }

                $summarize = function( $value ) {
                    return [
                        'value'  => is_string( $value ) ? psp_category_content_substr( $value, 0, 300 ) : $value,
                        'length' => is_string( $value ) ? psp_category_content_strlen( $value ) : null,
                    ];
                };

                return rest_ensure_response( [
                    'term_id'                 => $term_id,
                    'name'                    => $term->name,
                    'slug'                    => $term->slug,
                    'rank_math_title'         => $summarize( (string) get_term_meta( $term_id, 'rank_math_title', true ) ),
                    'rank_math_description'   => $summarize( (string) get_term_meta( $term_id, 'rank_math_description', true ) ),
                    'rank_math_focus_keyword' => $summarize( (string) get_term_meta( $term_id, 'rank_math_focus_keyword', true ) ),
                    'psp_cat_schema'          => $summarize( (string) get_term_meta( $term_id, 'psp_cat_schema', true ) ),
                ] );
            },
        ],
        [
            'methods'             => 'POST',
            'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
            'callback'            => function( WP_REST_Request $request ) {
                $term_id = (int) $request['id'];
                $term    = get_term( $term_id, 'product_cat' );
                if ( ! $term || is_wp_error( $term ) ) {
                    return new WP_Error( 'invalid_term', 'Category term not found', [ 'status' => 404 ] );
                }

                $updates = [];
                $summarize = function( $value ) {
                    return [
                        'value'  => is_string( $value ) ? psp_category_content_substr( $value, 0, 300 ) : $value,
                        'length' => is_string( $value ) ? psp_category_content_strlen( $value ) : null,
                    ];
                };

                $title = $request->get_param( 'title' );
                if ( null === $title ) {
                    $title = $request->get_param( 'rank_math_title' );
                }
                if ( null !== $title ) {
                    $sanitized_title = sanitize_text_field( (string) $title );
                    update_term_meta( $term_id, 'rank_math_title', $sanitized_title );
                    $updates['rank_math_title'] = $summarize( $sanitized_title );
                }

                $description = $request->get_param( 'description' );
                if ( null === $description ) {
                    $description = $request->get_param( 'rank_math_description' );
                }
                if ( null !== $description ) {
                    $sanitized_description = sanitize_text_field( (string) $description );
                    update_term_meta( $term_id, 'rank_math_description', $sanitized_description );
                    $updates['rank_math_description'] = $summarize( $sanitized_description );
                }

                $focus_keyword = $request->get_param( 'focus_keyword' );
                if ( null === $focus_keyword ) {
                    $focus_keyword = $request->get_param( 'rank_math_focus_keyword' );
                }
                if ( null !== $focus_keyword ) {
                    $sanitized_focus_keyword = sanitize_text_field( (string) $focus_keyword );
                    update_term_meta( $term_id, 'rank_math_focus_keyword', $sanitized_focus_keyword );
                    $updates['rank_math_focus_keyword'] = $summarize( $sanitized_focus_keyword );
                }

                $schema = $request->get_param( 'schema' );
                if ( null === $schema ) {
                    $schema = $request->get_param( 'psp_cat_schema' );
                }
                if ( null !== $schema ) {
                    $sanitized_schema = sanitize_textarea_field( (string) $schema );
                    update_term_meta( $term_id, 'psp_cat_schema', $sanitized_schema );
                    $updates['psp_cat_schema'] = $summarize( $sanitized_schema );
                }

                return rest_ensure_response( [
                    'term_id' => $term_id,
                    'updated' => $updates,
                ] );
            },
        ],
    ] );

    // 3d. Delete a single meta key by name
    register_rest_route( 'psp/v1', '/category-meta/(?P<id>\d+)/(?P<key>[a-zA-Z0-9_-]+)', [
        'methods'             => 'DELETE',
        'permission_callback' => function() { return current_user_can( 'manage_woocommerce' ); },
        'callback'            => function( WP_REST_Request $request ) {
            $term_id = (int) $request['id'];
            $key     = sanitize_key( $request['key'] );
            $before  = get_term_meta( $term_id, $key, true );
            $deleted = delete_term_meta( $term_id, $key );
            return rest_ensure_response( [
                'deleted'      => $deleted,
                'key'          => $key,
                'had_value'    => ! empty( $before ),
                'value_length' => is_string( $before ) ? psp_category_content_strlen( $before ) : 0,
            ] );
        },
    ] );
} );
