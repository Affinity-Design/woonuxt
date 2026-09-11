<?php
/**
 * psp/v1/upsell/* REST routes. Contract: specs/002-conditional-upsell-coupons/contracts/rest-api.md
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Rest {

    const NS = 'psp/v1';

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register_routes'));
    }

    public static function can_manage() {
        return current_user_can('manage_woocommerce') || current_user_can('manage_options');
    }

    public static function register_routes() {
        $manage = array(__CLASS__, 'can_manage');

        register_rest_route(self::NS, '/upsell/rules', array(
            array('methods' => 'GET', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'list_rules')),
            array('methods' => 'POST', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'create_rule')),
        ));

        register_rest_route(self::NS, '/upsell/rules/active', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'active_rules'),
            'args'                => array('channel' => array('type' => 'string', 'default' => 'ca')),
        ));

        register_rest_route(self::NS, '/upsell/rules/(?P<id>\d+)', array(
            array('methods' => 'GET', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'get_rule')),
            array('methods' => 'PUT', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'update_rule')),
            array('methods' => 'PATCH', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'patch_rule')),
            array('methods' => 'DELETE', 'permission_callback' => $manage, 'callback' => array(__CLASS__, 'delete_rule')),
        ));

        register_rest_route(self::NS, '/upsell/terms', array(
            'methods'             => 'GET',
            'permission_callback' => $manage,
            'callback'            => array(__CLASS__, 'terms'),
            'args'                => array(
                'taxonomy' => array('type' => 'string', 'default' => 'product_cat'),
                'search'   => array('type' => 'string', 'default' => ''),
                'per_page' => array('type' => 'integer', 'default' => 200),
            ),
        ));

        register_rest_route(self::NS, '/upsell/evaluate', array(
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'evaluate'),
        ));

        register_rest_route(self::NS, '/upsell/health', array(
            'methods'             => 'GET',
            'permission_callback' => $manage,
            'callback'            => array(__CLASS__, 'health'),
        ));
    }

    // ------------------------------------------------------------------

    public static function list_rules() {
        return rest_ensure_response(array('rules' => PSP_Upsell_Rules::all()));
    }

    public static function create_rule(WP_REST_Request $request) {
        $validated = PSP_Upsell_Rules::validate($request->get_json_params());
        if (is_wp_error($validated)) {
            return $validated;
        }
        $id = PSP_Upsell_Rules::save($validated['rule']);
        if (is_wp_error($id)) {
            return $id;
        }
        return new WP_REST_Response(array('rule' => PSP_Upsell_Rules::get($id), 'warnings' => $validated['warnings']), 201);
    }

    public static function get_rule(WP_REST_Request $request) {
        $rule = PSP_Upsell_Rules::get((int) $request['id']);
        if (!$rule) {
            return new WP_Error('upsell_rule_not_found', 'Rule not found.', array('status' => 404));
        }
        return rest_ensure_response(array('rule' => $rule));
    }

    public static function update_rule(WP_REST_Request $request) {
        $id = (int) $request['id'];
        if (!PSP_Upsell_Rules::get($id)) {
            return new WP_Error('upsell_rule_not_found', 'Rule not found.', array('status' => 404));
        }
        $validated = PSP_Upsell_Rules::validate($request->get_json_params());
        if (is_wp_error($validated)) {
            return $validated;
        }
        $saved = PSP_Upsell_Rules::save($validated['rule'], $id);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return rest_ensure_response(array('rule' => PSP_Upsell_Rules::get($id), 'warnings' => $validated['warnings']));
    }

    public static function patch_rule(WP_REST_Request $request) {
        $id = (int) $request['id'];
        $rule = PSP_Upsell_Rules::get($id);
        if (!$rule) {
            return new WP_Error('upsell_rule_not_found', 'Rule not found.', array('status' => 404));
        }
        $body = $request->get_json_params();
        $status = isset($body['status']) ? sanitize_key($body['status']) : '';
        if (!in_array($status, array('active', 'paused'), true)) {
            return new WP_Error('upsell_status_invalid', 'PATCH supports {"status": "active"|"paused"} only.', array('status' => 400));
        }
        $rule['status'] = $status;
        $saved = PSP_Upsell_Rules::save($rule, $id);
        if (is_wp_error($saved)) {
            return $saved;
        }
        return rest_ensure_response(array('rule' => PSP_Upsell_Rules::get($id), 'warnings' => array()));
    }

    public static function delete_rule(WP_REST_Request $request) {
        $id = (int) $request['id'];
        if (!PSP_Upsell_Rules::get($id)) {
            return new WP_Error('upsell_rule_not_found', 'Rule not found.', array('status' => 404));
        }
        PSP_Upsell_Rules::delete($id);
        return rest_ensure_response(array('deleted' => true, 'id' => $id));
    }

    public static function active_rules(WP_REST_Request $request) {
        $channel = sanitize_key((string) $request->get_param('channel'));
        if (!in_array($channel, PSP_Upsell_Rules::CHANNELS, true)) {
            return new WP_Error('upsell_channel_invalid', 'channel must be "ca" or "com".', array('status' => 400));
        }
        $compiled = PSP_Upsell_Rules::ensure_compiled();
        $etag = '"' . ($compiled['version'] ?: 'empty') . '"';
        $if_none_match = $request->get_header('if-none-match');
        if ($if_none_match && trim($if_none_match) === $etag) {
            $response = new WP_REST_Response(null, 304);
            $response->header('ETag', $etag);
            return $response;
        }
        $rules = array();
        foreach (PSP_Upsell_Rules::get_active($channel) as $rule) {
            $rules[] = PSP_Upsell_Rules::public_payload($rule, $channel);
        }
        $response = new WP_REST_Response(array(
            'version'     => $compiled['version'],
            'compiled_at' => $compiled['compiled_at'],
            'channel'     => $channel,
            'rules'       => $rules,
        ));
        $response->header('Cache-Control', 'public, max-age=60');
        $response->header('ETag', $etag);
        return $response;
    }

    public static function terms(WP_REST_Request $request) {
        $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
        if (!in_array($taxonomy, PSP_Upsell_Rules::allowed_taxonomies(), true) || !taxonomy_exists($taxonomy)) {
            return new WP_Error('upsell_taxonomy_invalid', 'Unsupported taxonomy.', array('status' => 400));
        }
        $per_page = min(500, max(1, (int) $request->get_param('per_page')));
        $terms = get_terms(array(
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
            'search'     => sanitize_text_field((string) $request->get_param('search')),
            'number'     => $per_page,
            'orderby'    => 'name',
        ));
        if (is_wp_error($terms)) {
            return $terms;
        }
        $out = array();
        foreach ($terms as $term) {
            $out[] = array(
                'id'     => (int) $term->term_id,
                'slug'   => $term->slug,
                'name'   => $term->name,
                'parent' => (int) $term->parent,
                'count'  => (int) $term->count,
            );
        }
        return rest_ensure_response(array('taxonomy' => $taxonomy, 'terms' => $out));
    }

    /** Session-bound evaluation for non-GraphQL consumers (cookie session, same-origin). */
    public static function evaluate(WP_REST_Request $request) {
        $body = (array) $request->get_json_params();
        $channel = isset($body['channel']) ? sanitize_key($body['channel']) : 'com';
        if (!in_array($channel, PSP_Upsell_Rules::CHANNELS, true)) {
            $channel = 'com';
        }
        $locale = PSP_Upsell_Rules::normalize_locale($body['locale'] ?? 'en');

        if (!WC()->cart && function_exists('wc_load_cart')) {
            wc_load_cart();
        }
        if (!WC()->cart) {
            return new WP_Error('upsell_no_cart', 'Cart unavailable in this context.', array('status' => 409));
        }
        PSP_Upsell_Channel::force($channel);
        PSP_Upsell_Engine::mark_dirty();
        WC()->cart->calculate_totals();
        $response = rest_ensure_response(PSP_Upsell_Engine::public_state($locale));
        $response->header('Cache-Control', 'private, no-store');
        return $response;
    }

    public static function health() {
        $compiled = PSP_Upsell_Rules::get_compiled();
        $counts = array('active' => 0, 'paused' => 0);
        foreach (PSP_Upsell_Rules::all() as $rule) {
            $key = ($rule['status'] ?? 'paused') === 'active' ? 'active' : 'paused';
            $counts[$key]++;
        }
        return rest_ensure_response(array(
            'plugin_version'    => PSP_UPSELL_VERSION,
            'wc_version'        => defined('WC_VERSION') ? WC_VERSION : null,
            'graphql_available' => class_exists('WPGraphQL'),
            'graphql_registered' => (bool) get_option(PSP_UPSELL_OPTION_GRAPHQL, false),
            'compiled_version'  => $compiled['version'],
            'compiled_at'       => $compiled['compiled_at'],
            'rule_counts'       => $counts,
            'generated_coupons' => array(
                'live'           => PSP_Upsell_Coupons::count_generated('live'),
                'expired_unused' => PSP_Upsell_Coupons::count_generated('expired_unused'),
                'retired'        => PSP_Upsell_Coupons::count_generated('retired'),
            ),
            'cron_next'         => wp_next_scheduled(PSP_UPSELL_CRON_HOOK) ? gmdate('c', wp_next_scheduled(PSP_UPSELL_CRON_HOOK)) : null,
            'last_cleanup'      => get_option(PSP_UPSELL_OPTION_LAST_CLEANUP, null),
        ));
    }
}
