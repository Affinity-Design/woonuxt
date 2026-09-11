<?php
/**
 * Daily purge of generated coupons so wp_posts stays bounded.
 *
 * Deleted: expired + never used after PSP_UPSELL_CLEANUP_GRACE_DAYS, and
 * retired/used coupons after PSP_UPSELL_RETIRED_RETENTION_DAYS. A coupon
 * that is unexpired and unused is never touched (it may belong to a live cart).
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_Cron {

    const BATCH = 200;

    public static function init() {
        add_action(PSP_UPSELL_CRON_HOOK, array(__CLASS__, 'run'));
        add_action('init', array(__CLASS__, 'schedule'));
    }

    public static function schedule() {
        if (!wp_next_scheduled(PSP_UPSELL_CRON_HOOK)) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', PSP_UPSELL_CRON_HOOK);
        }
    }

    public static function unschedule() {
        $timestamp = wp_next_scheduled(PSP_UPSELL_CRON_HOOK);
        while ($timestamp) {
            wp_unschedule_event($timestamp, PSP_UPSELL_CRON_HOOK);
            $timestamp = wp_next_scheduled(PSP_UPSELL_CRON_HOOK);
        }
    }

    /** @return array summary */
    public static function run() {
        $ids = get_posts(array(
            'post_type'   => 'shop_coupon',
            'post_status' => 'any',
            'fields'      => 'ids',
            'numberposts' => self::BATCH,
            'orderby'     => 'ID',
            'order'       => 'ASC',
            'meta_query'  => array(array('key' => PSP_Upsell_Coupons::META_RULE_ID, 'compare' => 'EXISTS')),
        ));

        $now = time();
        $grace = max(0, (int) PSP_UPSELL_CLEANUP_GRACE_DAYS) * DAY_IN_SECONDS;
        $retention = max(0, (int) PSP_UPSELL_RETIRED_RETENTION_DAYS) * DAY_IN_SECONDS;
        $deleted = 0;

        foreach ($ids as $id) {
            $coupon = new WC_Coupon((int) $id);
            if (!$coupon->get_id()) {
                continue;
            }
            $expires = $coupon->get_date_expires();
            $expires_at = $expires ? $expires->getTimestamp() : (int) $coupon->get_meta(PSP_Upsell_Coupons::META_GENERATED_AT);
            if (!$expires_at) {
                continue;
            }
            $used = $coupon->get_usage_count() > 0 || $coupon->get_meta(PSP_Upsell_Coupons::META_RETIRED);

            $should_delete = $used
                ? ($now - $expires_at > $retention)
                : ($now - $expires_at > $grace);

            if ($should_delete && wp_delete_post((int) $id, true)) {
                $deleted++;
            }
        }

        $summary = array('at' => gmdate('c'), 'scanned' => count($ids), 'deleted' => $deleted);
        update_option(PSP_UPSELL_OPTION_LAST_CLEANUP, $summary, false);
        if ($deleted) {
            error_log(sprintf('[psp-upsell] cleanup deleted %d generated coupon(s) of %d scanned', $deleted, count($ids)));
        }
        return $summary;
    }
}
