<?php
/**
 * Plugin Name: PSP FlyingPress Local-Only Optimizer
 * Description: Turns off FlyingPress's Cloud Optimizer (page-optimizer.flyingpress.com) so pages are cached with local optimizations only, and paces FlyingPress's preload queue.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * FlyingPress 5.x sends every page it caches to its Cloud Optimizer to find above-the-fold images, critical fonts
 * and used CSS. There is no setting to switch that off, and if the call fails (timeout, or HTTP 500
 * "TargetCloseError" on their side) Optimizer::process_output() answers 503, the page is never cached and the
 * preload queue retries it. At the PROD-03 cutover (2026-11-05) that loop pinned the CPU.
 *
 * Answer the request locally with an empty result instead: FlyingPress then caches every page with its local
 * optimizations (minify, lazy load, delayed JS, self-hosted assets). Cloudflare stays the CDN; FlyingCDN is not used.
 * Trade-off: no per-page above-the-fold image or critical-font hints, so the LCP images are excluded from lazy
 * loading by class instead (FlyingPress setting `lazy_load_exclusions`: wp-post-image, custom-logo).
 *
 * Re-enable the cloud by defining PSP_FLYINGPRESS_CLOUD_OPTIMIZER as true in wp-config.php.
 */
add_filter('pre_http_request', function ($preempt, $args, $url) {
    if (defined('PSP_FLYINGPRESS_CLOUD_OPTIMIZER') && PSP_FLYINGPRESS_CLOUD_OPTIMIZER) {
        return $preempt;
    }
    if (!is_string($url) || strpos($url, 'https://page-optimizer.flyingpress.com/') !== 0) {
        return $preempt;
    }
    return [
        'headers'  => [],
        'body'     => '{}',
        'response' => ['code' => 200, 'message' => 'OK'],
        'cookies'  => [],
        'filename' => null,
    ];
}, 10, 3);

// Pace the preload queue (default 0.5 s between requests) so a full rebuild stays well inside the CPU budget.
add_filter('flying_press_preload_delay', function () {
    return 2.0;
});
