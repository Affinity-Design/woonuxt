<?php
/**
 * one-time-fix-brand-pages.php
 *
 * ONE-TIME clean-up for proskatersplace.com brand (pwb-brand) pages.
 * Patches already-published content in place — NO Gemini, NO regeneration.
 *
 *   1. Contact email : info@proskatersplace.com -> customerservice@proskatersplace.com
 *   2. Brand casing  : lowercase brand names in visible copy -> canonical casing
 *                      (e.g. "twincam skates" -> "Twincam skates")
 *   3. Calculator    : old size-calculator link -> https://proskatersplace.ca/roller-skates-size-calculator
 *
 * It does NOT change text alignment — that is CSS (text-align:justify) handled by
 * the psp-brand-content-field mu-plugin — and it does NOT rewrite FAQs. It only
 * FLAGS component-only brands that still mention sizing so you can regenerate
 * just those with: optimize-brand-page.js --brand=<slug> --force
 *
 * ── HOW TO RUN ──────────────────────────────────────────────────────────────
 *   WP-CLI (recommended):
 *       wp eval-file one-time-fix-brand-pages.php
 *   Code Snippets plugin:
 *       paste everything BELOW the <?php line as a "Run once" snippet.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *   Starts in DRY RUN (writes nothing). Review the printed report, then set
 *   $DRY_RUN = false and run again to apply. Idempotent — safe to re-run.
 */

@set_time_limit(0);

$DRY_RUN   = true;                                     // <-- set to false to ACTUALLY write
$TAXONOMY  = 'pwb-brand';
$OLD_EMAIL = 'info@proskatersplace.com';
$NEW_EMAIL = 'customerservice@proskatersplace.com';
// Size calculator now lives on the .ca host. Old pages link to either the
// inline- or roller- slug on .com; replace the whole anchor (href + title + text)
// then mop up any bare URL. Both are idempotent against the new .ca link.
$NEW_CALC         = 'https://proskatersplace.ca/roller-skates-size-calculator';
$CALC_ANCHOR      = '<a href="' . $NEW_CALC . '" title="Find your perfect skate size">Skate Size Calculator</a>';
$CALC_ANCHOR_RE   = '#<a\s+href="https?://proskatersplace\.(?:com|ca)/(?:inline-skates|roller-skates)-size-calculator/?"[^>]*>[\s\S]*?</a>#i';
$CALC_URL_RE      = '#https?://proskatersplace\.(?:com|ca)/(?:inline-skates|roller-skates)-size-calculator/?(?=["\'\s)<])#i';

if ( ! function_exists('get_terms') ) {
    echo "Run this inside WordPress (e.g. wp eval-file one-time-fix-brand-pages.php).\n";
    return;
}

// Give the run admin capabilities so term writes are never silently kses-stripped.
if ( function_exists('wp_set_current_user') ) {
    $psp_admins = get_users([ 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ]);
    if ( ! empty($psp_admins) ) {
        wp_set_current_user( (int) $psp_admins[0] );
    }
}

/** Drop one trailing generic product word to get the distinctive brand base. */
function psp_canonical_base( $name ) {
    return trim( preg_replace('/\s+(skates?|skate|wheels?|bearings?|frames?|protection|brand|skis?)$/i', '', $name) );
}

/** info@…com -> customerservice@…com. Leaves the Canadian .ca address untouched. */
function psp_fix_email( $text, $old, $new ) {
    if ( $text === '' || $text === null ) return $text;
    return str_replace( $old, $new, $text );
}

/** Normalize the size-calculator link to the new .ca canonical anchor/URL. Idempotent. */
function psp_fix_calculator( $text, $anchor_re, $anchor, $url_re, $url ) {
    if ( $text === '' || $text === null ) return $text;
    $text = preg_replace( $anchor_re, $anchor, $text );
    $text = preg_replace( $url_re, $url, $text );
    return $text;
}

/**
 * Restore canonical brand casing in VISIBLE TEXT only (between > and <), so
 * href/src/slug/email values inside tags are never touched. Only the fully
 * lowercase form is replaced; a hyphen or letter immediately adjacent blocks the
 * match (so "microfiber" and "micro-adjustable" stay as-is). Idempotent.
 */
function psp_fix_casing( $html, $term_name ) {
    if ( $html === '' || $html === null ) return $html;

    $variants = array_unique( array_filter([ $term_name, psp_canonical_base($term_name) ]) );
    // Keep only variants that actually carry an uppercase letter; longest first
    // so the full name ("SEBA Skates") wins before the base ("SEBA").
    $variants = array_filter( $variants, function ( $v ) {
        return $v !== '' && $v !== mb_strtolower($v);
    } );
    usort( $variants, function ( $a, $b ) { return mb_strlen($b) - mb_strlen($a); } );
    if ( empty($variants) ) return $html;

    return preg_replace_callback( '/>([^<]+)</', function ( $m ) use ( $variants ) {
        $t = $m[1];
        foreach ( $variants as $v ) {
            $lower = mb_strtolower( $v );
            $t = preg_replace( '/(?<![A-Za-z-])' . preg_quote($lower, '/') . '(?![A-Za-z-])/u', $v, $t );
        }
        return '>' . $t . '<';
    }, $html );
}

$sizing_re = '/\b(sizing|size chart|what size|shoe size|boot fit|fitting|find your size|true to size)\b/i';

$terms = get_terms([ 'taxonomy' => $TAXONOMY, 'hide_empty' => false ]);
if ( is_wp_error($terms) ) {
    echo "ERROR: " . $terms->get_error_message() . "\n";
    return;
}

global $wpdb;
$lines   = [];
$lines[] = "== Brand page one-time fixer ==";
$lines[] = "Mode:  " . ( $DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writing to WordPress)" );
$lines[] = "Email: {$OLD_EMAIL} -> {$NEW_EMAIL}";
$lines[] = "Terms: " . count($terms);
$lines[] = str_repeat('-', 56);

$changed = 0;
$flagged = [];

foreach ( $terms as $term ) {
    $id = (int) $term->term_id;

    $desc    = (string) $term->description;
    $content = (string) get_term_meta( $id, 'psp_brand_content', true );
    $schema  = (string) get_term_meta( $id, 'psp_brand_schema', true );

    $new_desc    = psp_fix_casing( psp_fix_calculator( psp_fix_email($desc,    $OLD_EMAIL, $NEW_EMAIL), $CALC_ANCHOR_RE, $CALC_ANCHOR, $CALC_URL_RE, $NEW_CALC ), $term->name );
    $new_content = psp_fix_casing( psp_fix_calculator( psp_fix_email($content, $OLD_EMAIL, $NEW_EMAIL), $CALC_ANCHOR_RE, $CALC_ANCHOR, $CALC_URL_RE, $NEW_CALC ), $term->name );
    $new_schema  = psp_fix_email( $schema, $OLD_EMAIL, $NEW_EMAIL ); // JSON-LD: email only, no casing

    $diffs = [];
    if ( $new_desc    !== $desc )    $diffs[] = 'description';
    if ( $new_content !== $content ) $diffs[] = 'psp_brand_content';
    if ( $new_schema  !== $schema )  $diffs[] = 'psp_brand_schema';

    $mentions_sizing = (bool) preg_match( $sizing_re, "{$desc}\n{$content}\n{$schema}" );
    if ( $mentions_sizing ) $flagged[] = $term->slug;

    if ( empty($diffs) ) {
        if ( $mentions_sizing ) {
            $lines[] = "  .  {$term->name} ({$term->slug}) — no email/casing fix; mentions sizing (review)";
        }
        continue;
    }

    $lines[] = "  " . ( $DRY_RUN ? "[would fix]" : "[fixed]    " ) . " {$term->name} ({$term->slug}) — "
             . implode(', ', $diffs) . ( $mentions_sizing ? "  | mentions sizing" : "" );
    $changed++;

    if ( $DRY_RUN ) continue;

    // description: write straight to term_taxonomy so the exact (already-sanitized)
    // HTML is preserved — avoids wp_update_term's kses stripping headings/classes.
    if ( $new_desc !== $desc ) {
        $wpdb->update(
            $wpdb->term_taxonomy,
            [ 'description' => $new_desc ],
            [ 'term_id' => $id, 'taxonomy' => $TAXONOMY ]
        );
        clean_term_cache( $id, $TAXONOMY );
    }
    // meta: update_term_meta runs the registered sanitizers (wp_kses_post for
    // content) — identical to how optimize-brand-page.js originally stored it.
    if ( $new_content !== $content ) update_term_meta( $id, 'psp_brand_content', $new_content );
    if ( $new_schema  !== $schema )  update_term_meta( $id, 'psp_brand_schema',  $new_schema );
}

$lines[] = str_repeat('-', 56);
$lines[] = ( $DRY_RUN ? "Would change " : "Changed " ) . "{$changed} term(s).";

if ( ! empty($flagged) ) {
    $lines[] = "";
    $lines[] = "Sizing language found on " . count($flagged) . " page(s) — confirm these are skate/boot brands.";
    $lines[] = "Component-only brands (bearings/wheels/frames) should be REGENERATED, not just patched:";
    $lines[] = "  " . implode( ' ', array_map( function ( $s ) { return "--brand={$s}"; }, $flagged ) );
}

$report = implode("\n", $lines) . "\n";
if ( defined('WP_CLI') && WP_CLI ) {
    WP_CLI::log( $report );
} else {
    echo $report;
}
