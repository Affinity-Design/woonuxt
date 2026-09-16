<?php
/**
 * Rule storage (CPT psp_upsell_rule), validation, and the compiled rule set
 * used on the cart hot path. See specs/002-conditional-upsell-coupons/data-model.md.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Rules {

    const POST_TYPE = 'psp_upsell_rule';
    const META_KEY = '_psp_upsell_rule';
    const SCHEMA_VERSION = 1;

    const NOTICE_KEYS = array('product_trigger', 'product_target', 'cart_pending', 'cart_applied', 'checkout', 'coupon_label');
    const CHANNELS = array('ca', 'com');

    /** @var array|null per-request cache of get_compiled() */
    private static $compiled_cache = null;
    /** @var array per-request cache of get_active() keyed by channel */
    private static $active_cache = array();

    public static function init() {
        add_action('init', array(__CLASS__, 'register_post_type'));
        add_action('save_post_' . self::POST_TYPE, array(__CLASS__, 'on_saved'), 20, 1);
        add_action('trashed_post', array(__CLASS__, 'on_removed'));
        add_action('untrashed_post', array(__CLASS__, 'on_removed'));
        add_action('deleted_post', array(__CLASS__, 'on_removed'));
    }

    public static function register_post_type() {
        if (post_type_exists(self::POST_TYPE)) {
            return;
        }
        register_post_type(self::POST_TYPE, array(
            'labels'          => array('name' => 'Upsell Rules', 'singular_name' => 'Upsell Rule'),
            'public'          => false,
            'show_ui'         => false,
            'show_in_rest'    => false,
            'supports'        => array('title', 'revisions', 'author'),
            'capability_type' => 'shop_coupon',
            'map_meta_cap'    => true,
            'rewrite'         => false,
            'query_var'       => false,
        ));
    }

    public static function allowed_taxonomies() {
        return apply_filters('psp_upsell_taxonomies', array('product_cat', 'pa_manufacturer', 'pwb-brand'));
    }

    public static function defaults() {
        return array(
            'schema_version' => self::SCHEMA_VERSION,
            'name'           => '',
            'status'         => 'paused',
            'channels'       => array('ca', 'com'),
            'priority'       => 10,
            'trigger'        => array('selectors' => array(), 'trigger_label' => '', 'min_qty' => 1),
            'target'         => array(
                'selectors'             => array(),
                'match'                 => 'all',
                'target_label'          => '',
                'exclude_trigger_items' => true,
                'exclude_sale_items'    => false,
                'max_qty_per_order'     => null,
            ),
            'discount'       => array('type' => 'percent', 'amount' => 10),
            'schedule'       => array('starts_at' => null, 'ends_at' => null, 'timezone' => 'America/Toronto'),
            'notices'        => array(
                'en' => array(
                    'product_trigger' => 'Pair this with any {target} and get {discount} off',
                    'product_target'  => 'Add any {trigger} to get {discount} off these',
                    'cart_pending'    => 'You added {trigger}! Add {target} to your cart to save {discount}.',
                    'cart_applied'    => '{discount} off {target} applied.',
                    'checkout'        => 'Bundle savings: {discount} off {target}',
                    'coupon_label'    => 'Bundle savings: {discount} off {target}',
                ),
                'fr' => array(),
            ),
            'cta'            => array('ca_path' => null, 'com_path' => null),
            'coupon'         => array('ttl_hours' => PSP_UPSELL_COUPON_TTL_HOURS, 'code_prefix' => PSP_UPSELL_CODE_PREFIX),
        );
    }

    // ------------------------------------------------------------------
    // Validation
    // ------------------------------------------------------------------

    private static function err($code, $message) {
        return new WP_Error($code, $message, array('status' => 400));
    }

    /**
     * @param mixed $input decoded JSON body
     * @return array|WP_Error ['rule' => normalised rule, 'warnings' => string[]]
     */
    public static function validate($input) {
        if (!is_array($input)) {
            return self::err('upsell_invalid_body', 'Rule body must be a JSON object.');
        }
        $d = self::defaults();
        $warnings = array();
        $rule = array('schema_version' => self::SCHEMA_VERSION);

        $rule['name'] = sanitize_text_field((string) ($input['name'] ?? ''));
        if ($rule['name'] === '') {
            return self::err('upsell_name_empty', 'Rule name is required.');
        }

        $status = isset($input['status']) ? sanitize_key($input['status']) : 'paused';
        if (!in_array($status, array('active', 'paused'), true)) {
            return self::err('upsell_status_invalid', 'status must be "active" or "paused".');
        }
        $rule['status'] = $status;

        $channels = array();
        foreach ((array) ($input['channels'] ?? array()) as $c) {
            $c = sanitize_key($c);
            if (in_array($c, self::CHANNELS, true)) {
                $channels[] = $c;
            }
        }
        $channels = array_values(array_unique($channels));
        if (empty($channels)) {
            return self::err('upsell_channels_empty', 'At least one channel (ca, com) is required.');
        }
        $rule['channels'] = $channels;

        $rule['priority'] = isset($input['priority']) ? max(0, (int) $input['priority']) : 10;

        $trigger_in = is_array($input['trigger'] ?? null) ? $input['trigger'] : array();
        $trigger_selectors = self::validate_selectors($trigger_in['selectors'] ?? array());
        if (is_wp_error($trigger_selectors)) {
            return $trigger_selectors;
        }
        if (empty($trigger_selectors)) {
            return self::err('upsell_trigger_empty', 'The trigger needs at least one category or brand selector.');
        }
        $rule['trigger'] = array(
            'selectors'     => $trigger_selectors,
            'trigger_label' => sanitize_text_field((string) ($trigger_in['trigger_label'] ?? '')),
            'min_qty'       => max(1, (int) ($trigger_in['min_qty'] ?? 1)),
        );

        $target_in = is_array($input['target'] ?? null) ? $input['target'] : array();
        $target_selectors = self::validate_selectors($target_in['selectors'] ?? array());
        if (is_wp_error($target_selectors)) {
            return $target_selectors;
        }
        if (empty($target_selectors)) {
            return self::err('upsell_target_empty', 'The target needs at least one category or brand selector.');
        }
        $match = isset($target_in['match']) ? sanitize_key($target_in['match']) : 'all';
        if (!in_array($match, array('all', 'any'), true)) {
            return self::err('upsell_target_match_invalid', 'target.match must be "all" or "any".');
        }
        $max_qty = $target_in['max_qty_per_order'] ?? null;
        $max_qty = ($max_qty === null || $max_qty === '' ) ? null : max(1, (int) $max_qty);
        $rule['target'] = array(
            'selectors'             => $target_selectors,
            'match'                 => $match,
            'target_label'          => sanitize_text_field((string) ($target_in['target_label'] ?? '')),
            'exclude_trigger_items' => self::to_bool($target_in['exclude_trigger_items'] ?? true),
            'exclude_sale_items'    => self::to_bool($target_in['exclude_sale_items'] ?? false),
            'max_qty_per_order'     => $max_qty,
        );

        $discount_in = is_array($input['discount'] ?? null) ? $input['discount'] : array();
        $type = isset($discount_in['type']) ? sanitize_key($discount_in['type']) : 'percent';
        if ($type !== 'percent') {
            return self::err('upsell_discount_type', 'Only percent discounts are supported in this version.');
        }
        $amount = isset($discount_in['amount']) ? (float) $discount_in['amount'] : 0;
        if ($amount < 1 || $amount > 100) {
            return self::err('upsell_discount_range', 'Percent discount must be between 1 and 100.');
        }
        $rule['discount'] = array('type' => 'percent', 'amount' => round($amount, 2));

        $schedule_in = is_array($input['schedule'] ?? null) ? $input['schedule'] : array();
        $starts = self::validate_date($schedule_in['starts_at'] ?? null);
        $ends = self::validate_date($schedule_in['ends_at'] ?? null);
        if ($starts === false || $ends === false) {
            return self::err('upsell_schedule_format', 'Schedule dates must be YYYY-MM-DD.');
        }
        if ($starts && $ends && $starts > $ends) {
            return self::err('upsell_schedule_order', 'starts_at must be on or before ends_at.');
        }
        $tz = sanitize_text_field((string) ($schedule_in['timezone'] ?? 'America/Toronto'));
        if (!in_array($tz, timezone_identifiers_list(), true)) {
            $tz = 'America/Toronto';
        }
        $rule['schedule'] = array('starts_at' => $starts, 'ends_at' => $ends, 'timezone' => $tz);

        $notices_in = is_array($input['notices'] ?? null) ? $input['notices'] : array();
        $rule['notices'] = array('en' => array(), 'fr' => array());
        foreach (self::NOTICE_KEYS as $key) {
            $en = isset($notices_in['en'][$key]) ? sanitize_text_field((string) $notices_in['en'][$key]) : '';
            $rule['notices']['en'][$key] = $en !== '' ? $en : $d['notices']['en'][$key];
            $fr = isset($notices_in['fr'][$key]) ? sanitize_text_field((string) $notices_in['fr'][$key]) : '';
            if ($fr !== '') {
                $rule['notices']['fr'][$key] = $fr;
            }
        }

        $cta_in = is_array($input['cta'] ?? null) ? $input['cta'] : array();
        $rule['cta'] = array(
            'ca_path'  => self::validate_path($cta_in['ca_path'] ?? null),
            'com_path' => self::validate_path($cta_in['com_path'] ?? null),
        );
        if ($rule['cta']['ca_path'] === false || $rule['cta']['com_path'] === false) {
            return self::err('upsell_cta_invalid', 'CTA overrides must be site-relative paths starting with "/".');
        }

        $coupon_in = is_array($input['coupon'] ?? null) ? $input['coupon'] : array();
        $ttl = isset($coupon_in['ttl_hours']) ? (int) $coupon_in['ttl_hours'] : PSP_UPSELL_COUPON_TTL_HOURS;
        $prefix = strtoupper(preg_replace('/[^A-Z0-9]/i', '', (string) ($coupon_in['code_prefix'] ?? PSP_UPSELL_CODE_PREFIX)));
        $rule['coupon'] = array(
            'ttl_hours'   => min(720, max(1, $ttl)),
            'code_prefix' => $prefix !== '' ? $prefix : PSP_UPSELL_CODE_PREFIX,
        );

        if (!$rule['target']['exclude_trigger_items'] && self::selectors_overlap($trigger_selectors, $target_selectors)) {
            $warnings[] = 'upsell_overlap';
        }

        return array('rule' => $rule, 'warnings' => $warnings);
    }

    private static function validate_selectors($selectors) {
        if (!is_array($selectors)) {
            return self::err('upsell_selectors_invalid', 'selectors must be an array.');
        }
        $allowed = self::allowed_taxonomies();
        $out = array();
        foreach ($selectors as $sel) {
            if (!is_array($sel)) {
                continue;
            }
            $tax = isset($sel['taxonomy']) ? sanitize_key($sel['taxonomy']) : '';
            if (!in_array($tax, $allowed, true) || !taxonomy_exists($tax)) {
                return self::err('upsell_taxonomy_invalid', sprintf('Taxonomy "%s" is not allowed or does not exist.', $tax));
            }
            $ids = array();
            foreach ((array) ($sel['term_ids'] ?? array()) as $tid) {
                $tid = (int) $tid;
                if ($tid <= 0) {
                    continue;
                }
                $term = get_term($tid, $tax);
                if (!$term || is_wp_error($term)) {
                    return self::err('upsell_term_not_found', sprintf('Term %d does not exist in %s.', $tid, $tax));
                }
                $ids[] = $tid;
            }
            $ids = array_values(array_unique($ids));
            if (empty($ids)) {
                continue;
            }
            $out[] = array(
                'taxonomy'         => $tax,
                'term_ids'         => $ids,
                'include_children' => self::to_bool($sel['include_children'] ?? true) && is_taxonomy_hierarchical($tax),
            );
        }
        return $out;
    }

    private static function selectors_overlap(array $a, array $b) {
        foreach ($a as $sa) {
            foreach ($b as $sb) {
                if ($sa['taxonomy'] === $sb['taxonomy'] && array_intersect($sa['term_ids'], $sb['term_ids'])) {
                    return true;
                }
            }
        }
        return false;
    }

    private static function validate_date($value) {
        if ($value === null || $value === '') {
            return null;
        }
        $value = (string) $value;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $dt = DateTime::createFromFormat('Y-m-d', $value);
        return ($dt && $dt->format('Y-m-d') === $value) ? $value : false;
    }

    private static function validate_path($value) {
        if ($value === null || $value === '') {
            return null;
        }
        $value = trim((string) $value);
        if ($value === '' ) {
            return null;
        }
        if ($value[0] !== '/' || strpos($value, '//') === 0) {
            return false;
        }
        return esc_url_raw($value);
    }

    private static function to_bool($value) {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------

    /** @return int|WP_Error post id */
    public static function save(array $rule, $id = null) {
        $stored = $rule;
        unset($stored['id'], $stored['created'], $stored['modified'], $stored['author']);
        $postarr = array(
            'post_type'   => self::POST_TYPE,
            'post_status' => 'publish',
            'post_title'  => $stored['name'],
        );
        if ($id) {
            $postarr['ID'] = (int) $id;
            $result = wp_update_post($postarr, true);
        } else {
            $result = wp_insert_post($postarr, true);
        }
        if (is_wp_error($result)) {
            return $result;
        }
        update_post_meta((int) $result, self::META_KEY, wp_slash(wp_json_encode($stored)));
        self::compile();
        return (int) $result;
    }

    /** @return array|null */
    public static function get($id) {
        $post = get_post((int) $id);
        if (!$post || $post->post_type !== self::POST_TYPE || $post->post_status === 'trash') {
            return null;
        }
        $raw = get_post_meta($post->ID, self::META_KEY, true);
        $stored = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($stored)) {
            return null;
        }
        $rule = array_replace_recursive(self::defaults(), $stored);
        // array_replace_recursive merges lists by index (a stored ['ca'] would inherit the default
        // 'com' at index 1), so list-valued fields are taken verbatim from storage.
        if (isset($stored['channels']) && is_array($stored['channels'])) {
            $rule['channels'] = array_values($stored['channels']);
        }
        foreach (array('trigger', 'target') as $side) {
            if (isset($stored[$side]['selectors']) && is_array($stored[$side]['selectors'])) {
                $rule[$side]['selectors'] = array_values($stored[$side]['selectors']);
            }
        }
        $rule['id'] = (int) $post->ID;
        $rule['created'] = mysql2date('c', $post->post_date_gmt, false);
        $rule['modified'] = mysql2date('c', $post->post_modified_gmt, false);
        $rule['author'] = (int) $post->post_author;
        return $rule;
    }

    public static function all() {
        $ids = get_posts(array(
            'post_type'   => self::POST_TYPE,
            'post_status' => 'publish',
            'numberposts' => -1,
            'fields'      => 'ids',
            'orderby'     => 'ID',
            'order'       => 'ASC',
        ));
        $out = array();
        foreach ($ids as $id) {
            $rule = self::get($id);
            if ($rule) {
                $out[] = $rule;
            }
        }
        return $out;
    }

    public static function delete($id) {
        $post = get_post((int) $id);
        if (!$post || $post->post_type !== self::POST_TYPE) {
            return false;
        }
        return (bool) wp_trash_post((int) $id);
    }

    public static function on_saved($post_id) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        self::compile();
    }

    public static function on_removed($post_id) {
        if (get_post_type($post_id) === self::POST_TYPE) {
            self::compile();
        }
    }

    // ------------------------------------------------------------------
    // Compilation
    // ------------------------------------------------------------------

    public static function compile() {
        $rules = array();
        foreach (self::all() as $rule) {
            if (($rule['status'] ?? 'paused') !== 'active') {
                continue;
            }
            $rules[] = self::compile_rule($rule);
        }
        usort($rules, function ($a, $b) {
            if ($a['priority'] === $b['priority']) {
                return $a['id'] <=> $b['id'];
            }
            return $a['priority'] <=> $b['priority'];
        });
        $payload = array(
            'version'     => substr(sha1(wp_json_encode($rules)), 0, 12),
            'compiled_at' => current_time('c'),
            'rules'       => $rules,
        );
        update_option(PSP_UPSELL_OPTION_COMPILED, $payload, true);
        self::$compiled_cache = $payload;
        self::$active_cache = array();
        do_action('psp_upsell_rules_compiled', $payload);
        return $payload;
    }

    private static function compile_rule(array $rule) {
        $hash_source = $rule;
        unset($hash_source['id'], $hash_source['created'], $hash_source['modified'], $hash_source['author']);

        $compiled = array(
            'id'       => (int) $rule['id'],
            'name'     => $rule['name'],
            'status'   => $rule['status'],
            'channels' => array_values($rule['channels']),
            'priority' => (int) $rule['priority'],
            'hash'     => sha1(wp_json_encode($hash_source)),
            'trigger'  => array(
                'selectors' => self::compile_selectors($rule['trigger']['selectors']),
                'min_qty'   => max(1, (int) $rule['trigger']['min_qty']),
            ),
            'target'   => array(
                'selectors'             => self::compile_selectors($rule['target']['selectors']),
                'match'                 => $rule['target']['match'],
                'exclude_trigger_items' => (bool) $rule['target']['exclude_trigger_items'],
                'exclude_sale_items'    => (bool) $rule['target']['exclude_sale_items'],
                'max_qty_per_order'     => $rule['target']['max_qty_per_order'] ? (int) $rule['target']['max_qty_per_order'] : null,
            ),
            'discount' => array(
                'type'    => 'percent',
                'amount'  => (float) $rule['discount']['amount'],
                'display' => self::format_percent($rule['discount']['amount']),
            ),
            'schedule' => $rule['schedule'],
            'notices'  => $rule['notices'],
            'coupon'   => $rule['coupon'],
            'cta_overrides' => $rule['cta'],
        );
        $compiled['trigger']['label'] = $rule['trigger']['trigger_label'] !== '' ? $rule['trigger']['trigger_label'] : self::first_term_name($compiled['trigger']['selectors']);
        $compiled['target']['label'] = $rule['target']['target_label'] !== '' ? $rule['target']['target_label'] : self::first_term_name($compiled['target']['selectors']);
        $compiled['cta'] = array();
        foreach (self::CHANNELS as $channel) {
            $compiled['cta'][$channel] = array(
                'trigger_side' => PSP_Upsell_Channel::cta_path($compiled, 'trigger_side', $channel),
                'target_side'  => PSP_Upsell_Channel::cta_path($compiled, 'target_side', $channel),
            );
        }
        return $compiled;
    }

    private static function compile_selectors(array $selectors) {
        $out = array();
        foreach ($selectors as $sel) {
            $tax = $sel['taxonomy'];
            $terms = array();
            $ids = array();
            foreach ($sel['term_ids'] as $tid) {
                $term = get_term((int) $tid, $tax);
                if (!$term || is_wp_error($term)) {
                    continue;
                }
                $terms[] = array('id' => (int) $term->term_id, 'slug' => $term->slug, 'name' => $term->name);
                $ids[] = (int) $term->term_id;
                if (!empty($sel['include_children']) && is_taxonomy_hierarchical($tax)) {
                    $children = get_term_children((int) $term->term_id, $tax);
                    if (!is_wp_error($children)) {
                        foreach ($children as $child) {
                            $ids[] = (int) $child;
                        }
                    }
                }
            }
            if (empty($ids)) {
                continue;
            }
            $out[] = array(
                'taxonomy'         => $tax,
                'term_ids'         => array_values(array_unique($ids)),
                'terms'            => $terms,
                'include_children' => !empty($sel['include_children']),
            );
        }
        return $out;
    }

    private static function first_term_name(array $selectors) {
        foreach ($selectors as $sel) {
            if (!empty($sel['terms'][0]['name'])) {
                return $sel['terms'][0]['name'];
            }
        }
        return '';
    }

    public static function format_percent($amount) {
        $s = number_format((float) $amount, 2, '.', '');
        $s = rtrim(rtrim($s, '0'), '.');
        return $s . '%';
    }

    public static function get_compiled() {
        if (self::$compiled_cache !== null) {
            return self::$compiled_cache;
        }
        $payload = get_option(PSP_UPSELL_OPTION_COMPILED, null);
        if (!is_array($payload) || !isset($payload['rules'])) {
            $payload = array('version' => '', 'compiled_at' => null, 'rules' => array());
        }
        self::$compiled_cache = $payload;
        return $payload;
    }

    /** Compile if the option has never been written (REST/admin contexts only). */
    public static function ensure_compiled() {
        $payload = get_option(PSP_UPSELL_OPTION_COMPILED, null);
        if (!is_array($payload)) {
            return self::compile();
        }
        return self::get_compiled();
    }

    public static function today($timezone) {
        try {
            $tz = new DateTimeZone($timezone ?: 'America/Toronto');
        } catch (Exception $e) {
            $tz = new DateTimeZone('America/Toronto');
        }
        $now = new DateTime('now', $tz);
        return $now->format('Y-m-d');
    }

    public static function is_within_schedule(array $rule) {
        $schedule = $rule['schedule'] ?? array();
        $starts = $schedule['starts_at'] ?? null;
        $ends = $schedule['ends_at'] ?? null;
        if (!$starts && !$ends) {
            return true;
        }
        $today = self::today($schedule['timezone'] ?? 'America/Toronto');
        if ($starts && $today < $starts) {
            return false;
        }
        if ($ends && $today > $ends) {
            return false;
        }
        return true;
    }

    /** Active, in-schedule compiled rules for a channel, sorted by priority. */
    public static function get_active($channel) {
        $channel = (string) $channel;
        if (isset(self::$active_cache[$channel])) {
            return self::$active_cache[$channel];
        }
        $out = array();
        foreach (self::get_compiled()['rules'] as $rule) {
            if (($rule['status'] ?? '') !== 'active') {
                continue;
            }
            if (!in_array($channel, (array) $rule['channels'], true)) {
                continue;
            }
            if (!self::is_within_schedule($rule)) {
                continue;
            }
            $out[$rule['id']] = $rule;
        }
        self::$active_cache[$channel] = $out;
        return $out;
    }

    public static function find_active($rule_id, $channel) {
        $rules = self::get_active($channel);
        return $rules[(int) $rule_id] ?? null;
    }

    public static function version() {
        return (string) (self::get_compiled()['version'] ?? '');
    }

    // ------------------------------------------------------------------
    // Presentation helpers
    // ------------------------------------------------------------------

    public static function normalize_locale($locale) {
        $locale = strtolower(substr((string) $locale, 0, 2));
        return $locale === 'fr' ? 'fr' : 'en';
    }

    public static function notice_text(array $rule, $key, $locale = 'en') {
        $locale = self::normalize_locale($locale);
        $template = $rule['notices'][$locale][$key] ?? '';
        if ($template === '') {
            $template = $rule['notices']['en'][$key] ?? '';
        }
        if ($template === '') {
            $defaults = self::defaults();
            $template = $defaults['notices']['en'][$key] ?? '';
        }
        return self::render($template, $rule);
    }

    public static function render($template, array $rule) {
        return strtr((string) $template, array(
            '{discount}' => $rule['discount']['display'] ?? '',
            '{trigger}'  => $rule['trigger']['label'] ?? '',
            '{target}'   => $rule['target']['label'] ?? '',
        ));
    }

    /** Public (storefront-safe) shape of a compiled rule for one channel. */
    public static function public_payload(array $rule, $channel) {
        $channel = in_array($channel, self::CHANNELS, true) ? $channel : 'ca';
        $selectors = function (array $list) {
            $out = array();
            foreach ($list as $sel) {
                $out[] = array(
                    'taxonomy' => $sel['taxonomy'],
                    'term_ids' => $sel['term_ids'],
                    'terms'    => $sel['terms'],
                );
            }
            return $out;
        };
        return array(
            'id'       => $rule['id'],
            'name'     => $rule['name'],
            'priority' => $rule['priority'],
            'hash'     => $rule['hash'],
            'channels' => $rule['channels'],
            'trigger'  => array(
                'selectors' => $selectors($rule['trigger']['selectors']),
                'label'     => $rule['trigger']['label'],
                'min_qty'   => $rule['trigger']['min_qty'],
            ),
            'target'   => array(
                'selectors'             => $selectors($rule['target']['selectors']),
                'match'                 => $rule['target']['match'],
                'label'                 => $rule['target']['label'],
                'exclude_trigger_items' => $rule['target']['exclude_trigger_items'],
            ),
            'discount' => $rule['discount'],
            'schedule' => array('starts_at' => $rule['schedule']['starts_at'], 'ends_at' => $rule['schedule']['ends_at']),
            'notices'  => $rule['notices'],
            'cta'      => $rule['cta'][$channel],
        );
    }
}
