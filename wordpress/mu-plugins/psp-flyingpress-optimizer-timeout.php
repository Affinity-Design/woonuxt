<?php
/**
 * Plugin Name: PSP FlyingPress Optimizer Timeout
 * Description: Gives FlyingPress's Cloud Optimizer calls 40 s instead of its hard-coded 15 s, so large product pages get cached instead of failing with a 503.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * FlyingPress caches a page only after its Cloud Optimizer (page-optimizer.flyingpress.com) returns. Its
 * wp_remote_post() uses a 15 s timeout, and a timeout makes Optimizer::process_output() answer the preload with
 * HTTP 503 ("Error optimizing page."), so the page is never cached and the preload queue retries it forever.
 * Large product pages (~900 KB of HTML) regularly need longer. Found on PROD-03 at cutover, 2026-11-05: about a
 * third of product preloads failed this way. FlyingPress's own preload request allows 60 s, so 40 s still fits.
 */
add_filter('http_request_args', function ($args, $url) {
    if (is_string($url) && strpos($url, 'https://page-optimizer.flyingpress.com/') === 0) {
        $args['timeout'] = max((float) ($args['timeout'] ?? 0), 40);
    }
    return $args;
}, 10, 2);
