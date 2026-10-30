<?php
/**
 * recover-deleted-products.php
 *
 * Recovers WooCommerce products that were deleted from production, using a copy
 * of the site restored from an older Lightsail snapshot. Recovered products come
 * back as DRAFTS, tagged "Recovered from snapshot", so they can be reviewed and
 * re-published one by one. See wordpress/docs/prod-02-php-upgrade-runbook.md.
 *
 * ── HOW TO RUN ──────────────────────────────────────────────────────────────
 *   Use one export file per snapshot (e.g. psp-products-20261024.ser.gz and
 *   psp-products-20260506.ser.gz) so each pass keeps its own reports and upload list.
 *
 *   1. On the SNAPSHOT copy (never public, cron stopped):
 *        wp eval-file recover-deleted-products.php export /home/bitnami/psp-products-20261024.ser.gz
 *      The file is read back and verified before "Exported" is printed.
 *   2. Copy that file to the production box, then on PRODUCTION:
 *        wp eval-file recover-deleted-products.php plan  /home/bitnami/psp-products-20261024.ser.gz
 *      Writes <file>.plan-<time>.csv (path printed at the end) and appends to
 *      <file>.missing-uploads.txt. Writes nothing to WordPress.
 *   3. Snapshot production, then:
 *        wp eval-file recover-deleted-products.php apply /home/bitnami/psp-products-20261024.ser.gz
 *      Optional extra tokens:
 *        include-snapshot-trash      also recover products that were in the trash
 *                                    when the snapshot was taken (needed for the
 *                                    Oct 24 snapshot, where the deleted products sit)
 *        force-recreate=<id,id,...>  recover these snapshot IDs again even though the
 *                                    ledger says they were recovered before
 *        allow-myisam                run even though the tables can't roll back
 *   4. Copy the files in <file>.missing-uploads.txt from the snapshot copy's
 *      wp-content/uploads (rsync --files-from) BEFORE deleting the snapshot copy,
 *      then WooCommerce → Status → Tools → "Regenerate the product lookup tables"
 *      AND "Regenerate the product attributes lookup table".
 *
 * ── WHAT "apply" DOES PER SNAPSHOT PRODUCT ──────────────────────────────────
 *   present on production           → skipped (never overwritten)
 *   in production's trash           → untrashed AS A DRAFT (WooCommerce would
 *                                     otherwise restore its old status, e.g. publish),
 *                                     with slug/SKU/GTIN collisions resolved first
 *   gone from production            → re-created from the snapshot with its ORIGINAL
 *                                     ID (keeps order history and links intact), its
 *                                     variations, meta, categories, attributes, brand,
 *                                     images and reviews, as a draft
 *   ID now used by another post     → re-created with a new ID (reported)
 *   SKU / GTIN / slug now in use    → recovered copy gets a free "-recovered" SKU,
 *                                     no GTIN, and a unique slug (reported)
 *   recovered before (ledger)       → skipped unless listed in force-recreate=
 *   Products that were live in the snapshot are processed before ones that were
 *   in its trash, so a newer replacement always keeps the slug/SKU.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *   export and plan are read-only. Before plan or apply touches anything the
 *   whole file is validated (every record decodes, footer count matches). apply
 *   runs each product in its own DB transaction, records every recovery in the
 *   psp_recovery_ledger option, and is idempotent. Raw meta values are copied
 *   byte-for-byte; nothing is re-serialized. Compatible with PHP 7.4 – 8.4.
 */

@set_time_limit(0);
@ini_set('memory_limit', '1024M');

$PSP_FORMAT        = 'psp-product-recovery/3';
$PSP_RECOVERED_TAG = 'recovered-from-snapshot';
$PSP_LEDGER        = 'psp_recovery_ledger';
$PSP_EXTRA_TABLES  = [ 'atum_product_data' => 'product_id' ];   // plugin tables keyed by product id
// Trash bookkeeping and edit locks must not come back with the product (they are
// read first to restore the original slug, status and review states).
$PSP_SKIP_META     = [ '_edit_lock', '_wp_trash_meta_status', '_wp_trash_meta_time', '_wp_desired_post_slug', '_wp_trash_meta_comments_status' ];

if ( ! function_exists('wc_get_product') ) {
    echo "Run this inside WordPress with WooCommerce active (wp eval-file recover-deleted-products.php ...).\n";
    return;
}

$psp_mode = isset($args[0]) ? strtolower( (string) $args[0] ) : '';
$psp_file = isset($args[1]) ? (string) $args[1] : '';
$psp_opts = array_slice( isset($args) ? (array) $args : [], 2 );

if ( ! in_array( $psp_mode, [ 'export', 'plan', 'apply' ], true ) || $psp_file === '' ) {
    echo "Usage: wp eval-file recover-deleted-products.php <export|plan|apply> <file.ser.gz> [include-snapshot-trash] [force-recreate=<ids>] [allow-myisam]\n";
    return;
}

// Run as an administrator so nothing is silently capability- or kses-filtered.
$psp_admins = get_users([ 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ]);
$psp_admin  = ! empty($psp_admins) ? (int) $psp_admins[0] : 0;
if ( $psp_admin ) {
    wp_set_current_user( $psp_admin );
}

function psp_log( $msg ) {
    if ( defined('WP_CLI') && WP_CLI ) {
        WP_CLI::log( $msg );
    } else {
        echo $msg . "\n";
    }
}

function psp_fail( $msg ) {
    if ( defined('WP_CLI') && WP_CLI ) {
        WP_CLI::error( $msg );   // exits
    }
    echo "ERROR: {$msg}\n";
    exit( 1 );
}

/** One record per line: base64(serialize()) survives any bytes in meta values. */
function psp_write_record( $fh, $record ) {
    $line = base64_encode( serialize( $record ) ) . "\n";
    // gzwrite reports zlib errors as 0, not false, so compare the byte count.
    if ( gzwrite( $fh, $line ) !== strlen( $line ) ) {
        psp_fail( 'Write failed while exporting (disk full?).' );
    }
}

/** Returns the record, null at clean end of file, or false for a corrupt line. */
function psp_read_record( $fh ) {
    $line = gzgets( $fh );
    if ( $line === false ) return null;
    $line = trim( $line );
    if ( $line === '' ) return null;
    $raw = base64_decode( $line, true );
    if ( $raw === false ) return false;
    $data = @unserialize( $raw, [ 'allowed_classes' => false ] );
    return is_array( $data ) ? $data : false;
}

/**
 * Read the whole export once and fail loudly unless every record decodes and the
 * footer count matches. Returns [ header, product count, highest post ID used ].
 */
function psp_validate_export( $file, $format ) {
    $fh = gzopen( $file, 'rb' );
    if ( ! $fh ) psp_fail( "Cannot read {$file}" );
    $header = psp_read_record( $fh );
    if ( ! is_array( $header ) || ( $header['type'] ?? '' ) !== 'header' || ( $header['format'] ?? '' ) !== $format ) {
        psp_fail( "{$file} is not a {$format} export." );
    }
    $count  = 0;
    $max_id = 0;
    $footer = null;
    while ( true ) {
        $record = psp_read_record( $fh );
        if ( $record === null ) break;
        if ( $record === false ) psp_fail( "{$file} is corrupt after record {$count}. Re-copy it from the snapshot copy." );
        if ( $record['type'] === 'footer' ) { $footer = $record; break; }
        if ( $record['type'] !== 'product' ) continue;
        $count++;
        $max_id = max( $max_id, (int) $record['post']['ID'] );
        foreach ( $record['variations'] as $v ) $max_id = max( $max_id, (int) $v['post']['ID'] );
        foreach ( $record['attachments'] as $a ) $max_id = max( $max_id, (int) $a['post']['ID'] );
    }
    gzclose( $fh );
    if ( ! $footer || (int) $footer['products'] !== $count ) {
        psp_fail( "{$file} is incomplete ({$count} products, " . ( $footer ? "footer says {$footer['products']}" : 'no footer' ) . '). Re-copy it from the snapshot copy.' );
    }
    return [ $header, $count, $max_id ];
}

function psp_table_exists( $table ) {
    global $wpdb;
    return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;
}

function psp_post_meta_rows( $post_id ) {
    global $wpdb;
    return $wpdb->get_results( $wpdb->prepare(
        "SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d ORDER BY meta_id",
        $post_id
    ), ARRAY_N );
}

function psp_term_meta_rows( $term_id ) {
    global $wpdb;
    return $wpdb->get_results( $wpdb->prepare(
        "SELECT meta_key, meta_value FROM {$wpdb->termmeta} WHERE term_id = %d ORDER BY meta_id", (int) $term_id
    ), ARRAY_N );
}

/** Terms attached to a post, with description, term meta and the ancestor chain. */
function psp_post_terms( $post_id ) {
    global $wpdb;
    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT tt.taxonomy, tt.description, t.term_id, t.name, t.slug
           FROM {$wpdb->term_relationships} tr
           JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
           JOIN {$wpdb->terms} t ON t.term_id = tt.term_id
          WHERE tr.object_id = %d",
        $post_id
    ), ARRAY_A );

    $terms = [];
    foreach ( $rows as $row ) {
        $ancestors = [];
        if ( is_taxonomy_hierarchical( $row['taxonomy'] ) ) {
            foreach ( array_reverse( get_ancestors( (int) $row['term_id'], $row['taxonomy'], 'taxonomy' ) ) as $ancestor_id ) {
                $ancestor = get_term( $ancestor_id, $row['taxonomy'] );
                if ( $ancestor && ! is_wp_error( $ancestor ) ) {
                    $ancestors[] = [ $ancestor->slug, $ancestor->name, $ancestor->description, psp_term_meta_rows( $ancestor_id ) ];
                }
            }
        }
        $terms[] = [
            'taxonomy'    => $row['taxonomy'],
            'slug'        => $row['slug'],
            'name'        => $row['name'],
            'description' => $row['description'],
            'meta'        => psp_term_meta_rows( (int) $row['term_id'] ),
            'ancestors'   => $ancestors,   // top-down [slug, name, description, meta rows]
        ];
    }
    return $terms;
}

/** Attachment IDs a product or variation points at (featured image + gallery). */
function psp_attachment_ids( $meta_rows ) {
    $ids = [];
    foreach ( $meta_rows as $meta ) {
        if ( $meta[0] === '_thumbnail_id' ) {
            $ids[] = (int) $meta[1];
        } elseif ( $meta[0] === '_product_image_gallery' && $meta[1] !== '' ) {
            foreach ( explode( ',', (string) $meta[1] ) as $id ) {
                $ids[] = (int) $id;
            }
        }
    }
    return array_values( array_unique( array_filter( $ids ) ) );
}

/** Every file an attachment owns, relative to the uploads dir (original + resized). */
function psp_attachment_files( $meta_rows ) {
    $files = [];
    $base  = '';
    foreach ( $meta_rows as $meta ) {
        if ( $meta[0] === '_wp_attached_file' && $meta[1] !== '' ) {
            $files[] = $meta[1];
            $base    = dirname( $meta[1] );
        }
    }
    foreach ( $meta_rows as $meta ) {
        if ( $meta[0] !== '_wp_attachment_metadata' ) continue;
        $info = @unserialize( $meta[1], [ 'allowed_classes' => false ] );
        if ( ! is_array( $info ) ) continue;
        $dir = ( $base === '.' || $base === '' ) ? '' : $base . '/';
        if ( ! empty( $info['sizes'] ) && is_array( $info['sizes'] ) ) {
            foreach ( $info['sizes'] as $size ) {
                if ( ! empty( $size['file'] ) ) $files[] = $dir . $size['file'];
            }
        }
        if ( ! empty( $info['original_image'] ) ) $files[] = $dir . $info['original_image'];
    }
    return array_values( array_unique( $files ) );
}

// ═════════════════════════════════════════════════════════════════════════
// EXPORT — run on the snapshot copy
// ═════════════════════════════════════════════════════════════════════════
if ( $psp_mode === 'export' ) {
    global $wpdb;

    $fh = gzopen( $psp_file, 'wb6' );
    if ( ! $fh ) psp_fail( "Cannot write {$psp_file}" );

    $extra_tables = [];
    foreach ( $PSP_EXTRA_TABLES as $table => $column ) {
        if ( psp_table_exists( $wpdb->prefix . $table ) ) $extra_tables[ $table ] = $column;
    }

    psp_write_record( $fh, [
        'type'                 => 'header',
        'format'               => $PSP_FORMAT,
        'site'                 => home_url(),
        'exported_at_gmt'      => gmdate( 'Y-m-d H:i:s' ),
        'attribute_taxonomies' => $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}woocommerce_attribute_taxonomies", ARRAY_A ),
        'extra_tables'         => $extra_tables,
    ] );

    $product_ids = $wpdb->get_col(
        "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'product' AND post_status <> 'auto-draft' ORDER BY ID"
    );

    $count = 0;
    foreach ( $product_ids as $product_id ) {
        $product_id = (int) $product_id;
        $post       = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->posts} WHERE ID = %d", $product_id ), ARRAY_A );
        $meta       = psp_post_meta_rows( $product_id );

        $variations     = [];
        $attachment_ids = psp_attachment_ids( $meta );
        $variation_rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'product_variation' ORDER BY menu_order, ID",
            $product_id
        ), ARRAY_A );
        foreach ( $variation_rows as $variation ) {
            $variation_meta = psp_post_meta_rows( (int) $variation['ID'] );
            $attachment_ids = array_merge( $attachment_ids, psp_attachment_ids( $variation_meta ) );
            $variations[]   = [ 'post' => $variation, 'meta' => $variation_meta, 'terms' => psp_post_terms( (int) $variation['ID'] ) ];
        }

        $attachments = [];
        foreach ( array_unique( $attachment_ids ) as $attachment_id ) {
            $attachment = $wpdb->get_row( $wpdb->prepare(
                "SELECT * FROM {$wpdb->posts} WHERE ID = %d AND post_type = 'attachment'", $attachment_id
            ), ARRAY_A );
            if ( $attachment ) {
                $attachment_meta = psp_post_meta_rows( $attachment_id );
                $attachments[]   = [ 'post' => $attachment, 'meta' => $attachment_meta, 'files' => psp_attachment_files( $attachment_meta ) ];
            }
        }

        $comments = [];
        $comment_rows = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM {$wpdb->comments} WHERE comment_post_ID = %d ORDER BY comment_ID", $product_id
        ), ARRAY_A );
        foreach ( $comment_rows as $comment ) {
            $comments[] = [
                'comment' => $comment,
                'meta'    => $wpdb->get_results( $wpdb->prepare(
                    "SELECT meta_key, meta_value FROM {$wpdb->commentmeta} WHERE comment_id = %d ORDER BY meta_id",
                    (int) $comment['comment_ID']
                ), ARRAY_N ),
            ];
        }

        $extra = [];
        $owned_ids = array_merge( [ $product_id ], array_map( function ( $v ) { return (int) $v['post']['ID']; }, $variations ) );
        foreach ( $extra_tables as $table => $column ) {
            $extra[ $table ] = $wpdb->get_results(
                "SELECT * FROM {$wpdb->prefix}{$table} WHERE {$column} IN (" . implode( ',', array_map( 'intval', $owned_ids ) ) . ')',
                ARRAY_A
            );
        }

        psp_write_record( $fh, [
            'type'        => 'product',
            'post'        => $post,
            'meta'        => $meta,
            'terms'       => psp_post_terms( $product_id ),
            'variations'  => $variations,
            'attachments' => $attachments,
            'comments'    => $comments,
            'extra'       => $extra,
        ] );

        $count++;
        if ( $count % 200 === 0 ) {
            psp_log( "  exported {$count} products..." );
            wp_cache_flush();
        }
    }

    psp_write_record( $fh, [ 'type' => 'footer', 'products' => $count ] );
    gzclose( $fh );

    // gzclose can't report a short write, so read the file back before calling it done.
    list( , $verified ) = psp_validate_export( $psp_file, $PSP_FORMAT );
    if ( $verified !== $count ) psp_fail( "Exported {$count} products but only {$verified} read back from {$psp_file}." );

    psp_log( "Exported {$count} products from " . home_url() . " to {$psp_file} (read back and verified)" );
    return;
}

// ═════════════════════════════════════════════════════════════════════════
// PLAN / APPLY — run on production
// ═════════════════════════════════════════════════════════════════════════
global $wpdb;

$psp_apply         = ( $psp_mode === 'apply' );
$psp_include_trash = in_array( 'include-snapshot-trash', $psp_opts, true );
$psp_force_ids     = [];
foreach ( $psp_opts as $opt ) {
    if ( strpos( $opt, 'force-recreate=' ) === 0 ) {
        $psp_force_ids = array_values( array_filter( array_map( 'intval', explode( ',', substr( $opt, strlen( 'force-recreate=' ) ) ) ) ) );
    }
}

// Validate the whole file before touching anything: a truncated copy must not
// silently recover half the catalogue.
list( $header, $psp_records, $psp_max_id ) = psp_validate_export( $psp_file, $PSP_FORMAT );

if ( untrailingslashit( $header['site'] ) !== untrailingslashit( home_url() ) ) {
    psp_log( "WARNING: export came from {$header['site']} but this site is " . home_url() . '.' );
}

$attribute_defs = [];
foreach ( (array) $header['attribute_taxonomies'] as $def ) {
    $attribute_defs[ 'pa_' . $def['attribute_name'] ] = $def;
}
$extra_tables = [];
foreach ( (array) $header['extra_tables'] as $table => $column ) {
    if ( psp_table_exists( $wpdb->prefix . $table ) ) $extra_tables[ $table ] = $column;
}

if ( $psp_apply ) {
    // Every table a product's transaction writes must be able to roll back.
    $tx_tables = [ $wpdb->posts, $wpdb->postmeta, $wpdb->term_relationships, $wpdb->comments, $wpdb->commentmeta, $wpdb->terms, $wpdb->term_taxonomy, $wpdb->termmeta ];
    foreach ( array_keys( $extra_tables ) as $table ) $tx_tables[] = $wpdb->prefix . $table;
    $engines = $wpdb->get_col(
        "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('" . implode( "','", array_map( 'esc_sql', $tx_tables ) ) . "')"
    );
    if ( in_array( 'MyISAM', $engines, true ) && ! in_array( 'allow-myisam', $psp_opts, true ) ) {
        psp_fail( 'Some tables use MyISAM, so a failed product cannot be rolled back. Re-run with allow-myisam to accept that.' );
    }

    // New-ID inserts must never take an ID that a later snapshot product still needs.
    $auto_increment = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s", $wpdb->posts
    ) );
    if ( $psp_max_id >= $auto_increment ) {
        $wpdb->query( "ALTER TABLE {$wpdb->posts} AUTO_INCREMENT = " . ( (int) $psp_max_id + 1 ) );
    }
}

$uploads_dir  = wp_get_upload_dir()['basedir'];
$stamp        = gmdate( 'Ymd-His' );
$report_path  = $psp_file . ( $psp_apply ? '.apply-' : '.plan-' ) . $stamp . '.csv';
$missing_path = $psp_file . '.missing-uploads.txt';
$report       = fopen( $report_path, 'w' );
if ( ! $report ) psp_fail( "Cannot write the report {$report_path} (check the directory is writable by this user)." );
fputcsv( $report, [ 'snapshot_id', 'new_id', 'sku', 'title', 'snapshot_status', 'production_state', 'action', 'variations', 'attachments_created', 'missing_files', 'notes' ], ',', '"', '\\' );

// The missing-uploads list is appended as we go, so a crash or re-run never drops files.
$missing_seen = [];
if ( file_exists( $missing_path ) ) {
    foreach ( file( $missing_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES ) as $line ) $missing_seen[ $line ] = true;
}
$missing_fh = fopen( $missing_path, 'a' );
if ( ! $missing_fh ) psp_fail( "Cannot append to {$missing_path}" );

$totals        = [];
$created_terms = [];
$ledger        = (array) get_option( $PSP_LEDGER, [] );   // snapshot_id => recovered post id
// Values handed out earlier in this run, so plan sees the same collisions apply will.
$GLOBALS['psp_claimed'] = [ '_sku' => [], '_global_unique_id' => [], 'slug' => [] ];

/** Production state of a post ID, from production's point of view. */
function psp_prod_state( $id, $expected_type ) {
    global $wpdb;
    $row = $wpdb->get_row( $wpdb->prepare( "SELECT post_type, post_status FROM {$wpdb->posts} WHERE ID = %d", $id ), ARRAY_A );
    if ( ! $row ) return 'missing';
    if ( $row['post_type'] !== $expected_type ) return 'id-conflict';
    return $row['post_status'] === 'trash' ? 'trashed' : 'present';
}

/** A post already re-created from this snapshot ID, if any. */
function psp_already_recovered( $snapshot_id ) {
    global $wpdb;
    return (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_psp_recovered_source_id' AND meta_value = %s LIMIT 1",
        (string) $snapshot_id
    ) );
}

function psp_claim( $key, $value ) {
    if ( $value !== '' ) $GLOBALS['psp_claimed'][ $key ][ $value ] = true;
}

/** Is this meta value (SKU / GTIN) used by any other non-trashed product or variation, or claimed this run? */
function psp_meta_taken( $key, $value, $own_id ) {
    global $wpdb;
    if ( $value === '' ) return false;
    if ( isset( $GLOBALS['psp_claimed'][ $key ][ $value ] ) ) return true;
    return (bool) $wpdb->get_var( $wpdb->prepare(
        "SELECT p.ID FROM {$wpdb->posts} p
           JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
          WHERE m.meta_value = %s AND p.ID <> %d AND p.post_status <> 'trash'
            AND p.post_type IN ('product', 'product_variation')
          LIMIT 1",
        $key, $value, $own_id
    ) );
}

/** The SKU itself if free, else the first free "-recovered[-n]" variant. */
function psp_free_sku( $sku, $own_id ) {
    if ( ! psp_meta_taken( '_sku', $sku, $own_id ) ) return $sku;
    $n = 1;
    do {
        $candidate = $sku . '-recovered' . ( $n > 1 ? "-{$n}" : '' );
        $n++;
    } while ( psp_meta_taken( '_sku', $candidate, 0 ) );
    return $candidate;
}

/** A product slug no live/draft product (or earlier record this run) uses. */
function psp_unique_slug( $slug, $own_id ) {
    $candidate = wp_unique_post_slug( $slug, $own_id, 'publish', 'product', 0 );
    $n = 2;
    while ( isset( $GLOBALS['psp_claimed']['slug'][ $candidate ] ) ) {
        $candidate = wp_unique_post_slug( $slug . '-' . $n, $own_id, 'publish', 'product', 0 );
        $n++;
    }
    psp_claim( 'slug', $candidate );
    return $candidate;
}

function psp_meta_value( $meta_rows, $key ) {
    foreach ( $meta_rows as $meta ) {
        if ( $meta[0] === $key ) return (string) $meta[1];
    }
    return '';
}

/** Note (and append to the copy list) every upload file this record needs that isn't on this server. */
function psp_check_files( $record, $uploads_dir, &$missing_seen, $missing_fh ) {
    $misses = 0;
    foreach ( $record['attachments'] as $attachment ) {
        foreach ( $attachment['files'] as $file ) {
            if ( file_exists( $uploads_dir . '/' . $file ) ) continue;
            $misses++;
            if ( ! isset( $missing_seen[ $file ] ) ) {
                fwrite( $missing_fh, $file . "\n" );
                fflush( $missing_fh );
                $missing_seen[ $file ] = true;
            }
        }
    }
    return $misses;
}

/** An earlier run's new-ID copy of this attachment, if any. */
function psp_recovered_attachment( $old_id ) {
    global $wpdb;
    return (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_psp_recovered_attachment_source' AND meta_value = %s LIMIT 1",
        (string) $old_id
    ) );
}

/**
 * Make sure a pa_* attribute taxonomy exists so its terms can be attached.
 * Called OUTSIDE the per-product transaction. Returns false (with a note) when it can't.
 */
function psp_ensure_taxonomy( $taxonomy, $apply, $attribute_defs, &$notes ) {
    if ( taxonomy_exists( $taxonomy ) ) return true;
    if ( strpos( $taxonomy, 'pa_' ) !== 0 || ! isset( $attribute_defs[ $taxonomy ] ) ) {
        $notes[] = "taxonomy {$taxonomy} missing on production, terms skipped";
        return false;
    }
    $notes[] = "attribute {$taxonomy} " . ( $apply ? 'created' : 'would be created' );
    if ( ! $apply ) return false;

    $def    = $attribute_defs[ $taxonomy ];
    $result = wc_create_attribute([
        'name'         => $def['attribute_label'] !== '' ? $def['attribute_label'] : $def['attribute_name'],
        'slug'         => $def['attribute_name'],
        'type'         => $def['attribute_type'],
        'order_by'     => $def['attribute_orderby'],
        'has_archives' => (bool) $def['attribute_public'],
    ]);
    if ( is_wp_error( $result ) ) {
        $notes[] = "attribute {$taxonomy} create failed: " . $result->get_error_message();
        return false;
    }
    // WooCommerce registers attribute taxonomies on init; register it for this run.
    register_taxonomy( $taxonomy, [ 'product', 'product_variation' ], [ 'hierarchical' => false, 'show_ui' => false, 'query_var' => true, 'rewrite' => false ] );
    return true;
}

/**
 * Resolve a term by slug. If the term itself is gone, create it (and any missing
 * ancestors) with its description and term meta. Returns term_id, or 0 in plan mode.
 */
function psp_resolve_term( $term, $apply, &$created_terms ) {
    global $wpdb;
    $taxonomy = $term['taxonomy'];
    if ( ! taxonomy_exists( $taxonomy ) ) {
        $created_terms[ "{$taxonomy}:{$term['slug']}" ] = true;
        return 0;
    }
    $leaf = get_term_by( 'slug', $term['slug'], $taxonomy );
    if ( $leaf ) return (int) $leaf->term_id;

    $parent_id = 0;
    $chain     = array_merge( (array) $term['ancestors'], [ [ $term['slug'], $term['name'], (string) ( $term['description'] ?? '' ), (array) ( $term['meta'] ?? [] ) ] ] );
    foreach ( $chain as $link ) {
        $slug  = $link[0];
        $name  = $link[1];
        $desc  = isset( $link[2] ) ? (string) $link[2] : '';
        $tmeta = isset( $link[3] ) ? (array) $link[3] : [];
        $existing = get_term_by( 'slug', $slug, $taxonomy );
        if ( $existing ) {
            $parent_id = (int) $existing->term_id;
            continue;
        }
        $created_terms[ "{$taxonomy}:{$slug}" ] = true;
        if ( ! $apply ) { $parent_id = 0; continue; }
        $made = wp_insert_term( $name, $taxonomy, [ 'slug' => $slug, 'parent' => $parent_id, 'description' => $desc ] );
        if ( is_wp_error( $made ) ) {
            throw new Exception( "term {$taxonomy}:{$slug}: " . $made->get_error_message() );
        }
        $parent_id = (int) $made['term_id'];
        // Brand pages keep their SEO content in term meta; bring it back raw.
        foreach ( $tmeta as $meta ) {
            if ( strpos( $meta[0], 'product_count_' ) === 0 ) continue;
            if ( $meta[0] === 'thumbnail_id' && get_post_type( (int) $meta[1] ) !== 'attachment' ) continue;
            $wpdb->insert( $wpdb->termmeta, [ 'term_id' => $parent_id, 'meta_key' => $meta[0], 'meta_value' => $meta[1] ] );
        }
    }
    return $apply ? $parent_id : 0;
}

/** Ensure every taxonomy the record uses exists (outside any transaction). */
function psp_prepare_taxonomies( $record, $apply, $attribute_defs, &$notes ) {
    $taxonomies = [];
    foreach ( $record['terms'] as $term ) $taxonomies[ $term['taxonomy'] ] = true;
    foreach ( $record['variations'] as $variation ) {
        foreach ( $variation['terms'] as $term ) $taxonomies[ $term['taxonomy'] ] = true;
    }
    foreach ( array_keys( $taxonomies ) as $taxonomy ) {
        psp_ensure_taxonomy( $taxonomy, $apply, $attribute_defs, $notes );
    }
}

/** Attach terms (grouped by taxonomy). Unknown taxonomies are skipped. */
function psp_attach_terms( $post_id, $terms, $apply, &$created_terms ) {
    $by_taxonomy = [];
    foreach ( $terms as $term ) {
        if ( ! taxonomy_exists( $term['taxonomy'] ) && $apply ) continue;
        $term_id = psp_resolve_term( $term, $apply, $created_terms );
        if ( $term_id ) $by_taxonomy[ $term['taxonomy'] ][] = $term_id;
    }
    if ( ! $apply ) return;
    foreach ( $by_taxonomy as $taxonomy => $ids ) {
        $result = wp_set_object_terms( $post_id, array_map( 'intval', $ids ), $taxonomy, false );
        if ( is_wp_error( $result ) ) {
            throw new Exception( "set terms {$taxonomy}: " . $result->get_error_message() );
        }
    }
}

/** Insert a post row exactly as exported; returns the ID actually used. */
function psp_insert_post_row( $row, $keep_id, $overrides ) {
    global $wpdb;
    foreach ( $overrides as $key => $value ) $row[ $key ] = $value;
    if ( ! $keep_id ) unset( $row['ID'] );
    if ( $wpdb->insert( $wpdb->posts, $row ) === false ) {
        throw new Exception( 'insert post: ' . $wpdb->last_error );
    }
    return $keep_id ? (int) $row['ID'] : (int) $wpdb->insert_id;
}

/** Insert raw meta rows byte-for-byte (no re-serialization). */
function psp_insert_meta_rows( $post_id, $meta_rows, $replace, $skip ) {
    global $wpdb;
    foreach ( $meta_rows as $meta ) {
        list( $key, $value ) = $meta;
        if ( in_array( $key, $skip, true ) ) continue;
        if ( array_key_exists( $key, $replace ) ) {
            if ( $replace[ $key ] === null ) continue;   // null = drop this meta
            $value = $replace[ $key ];
        }
        if ( $wpdb->insert( $wpdb->postmeta, [ 'post_id' => $post_id, 'meta_key' => $key, 'meta_value' => $value ] ) === false ) {
            throw new Exception( "insert meta {$key}: " . $wpdb->last_error );
        }
    }
}

/**
 * Undo what trashing did to a post row from the snapshot: restore the original
 * slug (WordPress renames trashed posts to "slug__trashed") and the pre-trash status.
 */
function psp_untrash_row( $row, $meta_rows, $fallback_status ) {
    if ( $row['post_status'] !== 'trash' ) return $row;
    $desired = psp_meta_value( $meta_rows, '_wp_desired_post_slug' );
    if ( $desired !== '' ) {
        $row['post_name'] = $desired;
    } else {
        $row['post_name'] = preg_replace( '/__trashed(-\d+)?$/', '', (string) $row['post_name'] );
    }
    $previous = psp_meta_value( $meta_rows, '_wp_trash_meta_status' );
    $row['post_status'] = $previous !== '' ? $previous : $fallback_status;
    return $row;
}

function psp_tag_recovered( $post_id, $snapshot_id, $original_status, $tag ) {
    wp_set_object_terms( $post_id, [ $tag ], 'product_tag', true );
    update_post_meta( $post_id, '_psp_recovered_source_id', (string) $snapshot_id );
    update_post_meta( $post_id, '_psp_recovered_original_status', $original_status );
    update_post_meta( $post_id, '_psp_recovered_at', gmdate( 'Y-m-d H:i:s' ) );
}

function psp_ledger_add( $option, $snapshot_id, $post_id ) {
    $ledger = (array) get_option( $option, [] );
    $ledger[ $snapshot_id ] = (int) $post_id;
    update_option( $option, $ledger, false );
    return $ledger;
}

/** Parents restored from the trash become drafts; variations keep their own status. */
function psp_force_draft_on_untrash( $status, $post_id ) {
    return get_post_type( $post_id ) === 'product' ? 'draft' : $status;
}

if ( $psp_apply ) {
    if ( ! term_exists( $PSP_RECOVERED_TAG, 'product_tag' ) ) {
        wp_insert_term( 'Recovered from snapshot', 'product_tag', [ 'slug' => $PSP_RECOVERED_TAG ] );
    }
    wp_defer_term_counting( true );
}

// Two passes: products that were live in the snapshot first, then ones that were
// already in its trash, so a newer replacement always keeps its slug/SKU/GTIN.
$psp_count = 0;
foreach ( [ false, true ] as $psp_trash_pass ) {
    $fh = gzopen( $psp_file, 'rb' );
    psp_read_record( $fh );   // header, already validated

    while ( ( $record = psp_read_record( $fh ) ) !== null ) {
        if ( $record === false || $record['type'] === 'footer' ) break;
        if ( $record['type'] !== 'product' ) continue;
        if ( ( $record['post']['post_status'] === 'trash' ) !== $psp_trash_pass ) continue;
        $psp_count++;

        $post            = $record['post'];
        $snapshot_id     = (int) $post['ID'];
        $sku             = psp_meta_value( $record['meta'], '_sku' );
        $snapshot_trash  = ( $post['post_status'] === 'trash' );
        $original_status = $snapshot_trash ? ( psp_meta_value( $record['meta'], '_wp_trash_meta_status' ) ?: 'publish' ) : $post['post_status'];
        $notes           = [];
        $state           = psp_prod_state( $snapshot_id, 'product' );
        $action          = 'skip';
        $new_id          = '';
        $att_created     = 0;
        $file_misses     = 0;

        // An ID that now holds a DIFFERENT recovered product is a conflict, not "present".
        if ( in_array( $state, [ 'present', 'trashed' ], true ) ) {
            $source = get_post_meta( $snapshot_id, '_psp_recovered_source_id', true );
            if ( $source !== '' && (int) $source !== $snapshot_id ) $state = 'id-conflict';
        }

        // Already recovered by an earlier run? Never recover twice. force-recreate=<ids>
        // only bypasses the ledger, never a copy that still exists.
        $recovered_as     = psp_already_recovered( $snapshot_id );
        $recovered_exists = $recovered_as && $recovered_as !== $snapshot_id && get_post_status( $recovered_as ) !== false;
        $forced           = in_array( $snapshot_id, $psp_force_ids, true );
        if ( $state !== 'present' && ( $recovered_exists || ( ! $forced && isset( $ledger[ $snapshot_id ] ) ) ) ) {
            $state   = 'already-recovered';
            $new_id  = $recovered_as ?: (int) $ledger[ $snapshot_id ];
            $notes[] = 'recovered by an earlier run' . ( $recovered_exists ? '' : ' (list it in force-recreate= to recover again)' );
        }

        if ( $state === 'present' ) {
            if ( $snapshot_trash ) {
                $notes[] = 'trashed in snapshot but ' . get_post_status( $snapshot_id ) . ' on production';
            }
            $prod_variations = (int) $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'product_variation' AND post_status <> 'trash'",
                $snapshot_id
            ) );
            if ( $prod_variations < count( $record['variations'] ) ) {
                $notes[] = 'production has ' . $prod_variations . ' of ' . count( $record['variations'] ) . ' variations (not changed)';
            }
            // A product this tool recovered earlier still needs its image files.
            if ( get_post_meta( $snapshot_id, '_psp_recovered_source_id', true ) !== '' ) {
                $file_misses = psp_check_files( $record, $uploads_dir, $missing_seen, $missing_fh );
            }
        } elseif ( $state === 'already-recovered' ) {
            $file_misses = psp_check_files( $record, $uploads_dir, $missing_seen, $missing_fh );
        } elseif ( $snapshot_trash && ! $psp_include_trash ) {
            $notes[] = 'already trashed in snapshot (pass include-snapshot-trash to recover)';
        } elseif ( $state === 'trashed' ) {
            $action = 'untrash';
            $new_id = $snapshot_id;

            // Work out the slug and SKU/GTIN collisions first, in plan and apply alike.
            $cur_slug  = (string) get_post_field( 'post_name', $snapshot_id );
            $desired   = (string) get_post_meta( $snapshot_id, '_wp_desired_post_slug', true );
            if ( $desired === '' ) $desired = preg_replace( '/__trashed(-\d+)?$/', '', $cur_slug );
            $safe_slug = $desired === '' ? '' : psp_unique_slug( $desired, $snapshot_id );
            if ( $safe_slug !== $desired ) $notes[] = "slug {$desired} in use, recovered as {$safe_slug}";

            $own_ids = array_merge( [ $snapshot_id ], array_map( 'intval', $wpdb->get_col( $wpdb->prepare(
                "SELECT ID FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'product_variation'", $snapshot_id
            ) ) ) );
            $sku_fix   = [];
            $gtin_drop = [];
            foreach ( $own_ids as $oid ) {
                $osku  = (string) get_post_meta( $oid, '_sku', true );
                $ofree = psp_free_sku( $osku, $oid );
                if ( $ofree !== $osku ) {
                    $sku_fix[ $oid ] = $ofree;
                    $notes[] = "SKU {$osku} (post {$oid}) in use, recovered as {$ofree}";
                }
                psp_claim( '_sku', $ofree );
                $ogtin = (string) get_post_meta( $oid, '_global_unique_id', true );
                if ( psp_meta_taken( '_global_unique_id', $ogtin, $oid ) ) {
                    $gtin_drop[] = $oid;
                    $notes[] = "GTIN {$ogtin} (post {$oid}) in use, recovered without a GTIN";
                } else {
                    psp_claim( '_global_unique_id', $ogtin );
                }
            }

            if ( $psp_apply ) {
                foreach ( $sku_fix as $oid => $value ) update_post_meta( $oid, '_sku', $value );
                foreach ( $gtin_drop as $oid ) delete_post_meta( $oid, '_global_unique_id' );

                add_filter( 'wp_untrash_post_status', 'psp_force_draft_on_untrash', 20, 2 );
                $untrashed = wp_untrash_post( $snapshot_id );
                remove_filter( 'wp_untrash_post_status', 'psp_force_draft_on_untrash', 20 );
                if ( ! $untrashed || get_post_status( $snapshot_id ) !== 'draft' ) {
                    $action  = 'FAILED';
                    $notes[] = 'untrash did not leave the product as a draft (now ' . get_post_status( $snapshot_id ) . '); check by hand';
                } else {
                    // wp_unique_post_slug skips drafts, so set the checked slug ourselves.
                    if ( $safe_slug !== '' && get_post_field( 'post_name', $snapshot_id ) !== $safe_slug ) {
                        $wpdb->update( $wpdb->posts, [ 'post_name' => $safe_slug ], [ 'ID' => $snapshot_id ] );
                        clean_post_cache( $snapshot_id );
                    }
                    psp_tag_recovered( $snapshot_id, $snapshot_id, $original_status, $PSP_RECOVERED_TAG );
                    $ledger = psp_ledger_add( $PSP_LEDGER, $snapshot_id, $snapshot_id );
                    wc_delete_product_transients( $snapshot_id );
                }
            }
        } elseif ( $state === 'missing' || $state === 'id-conflict' ) {
            $keep_id = ( $state === 'missing' );
            $action  = $keep_id ? 'recreate' : 'recreate-new-id';

            // Undo what trashing did inside the snapshot (slug + status), then make sure
            // the slug doesn't shadow a live product: .ca resolves products by slug.
            $post = psp_untrash_row( $post, $record['meta'], 'publish' );
            if ( (string) $post['post_name'] !== '' ) {
                $unique_slug = psp_unique_slug( $post['post_name'], $keep_id ? $snapshot_id : 0 );
                if ( $unique_slug !== $post['post_name'] ) {
                    $notes[] = "slug {$post['post_name']} in use, recovered as {$unique_slug}";
                    $post['post_name'] = $unique_slug;
                }
            }

            // SKU / GTIN collisions (product + variations), checked in plan and apply alike.
            $meta_replace = [];
            $free_sku     = psp_free_sku( $sku, $keep_id ? $snapshot_id : 0 );
            if ( $free_sku !== $sku ) {
                $meta_replace['_sku'] = $free_sku;
                $notes[] = "SKU {$sku} in use, recovered as {$free_sku}";
            }
            psp_claim( '_sku', $free_sku );
            $gtin = psp_meta_value( $record['meta'], '_global_unique_id' );
            if ( psp_meta_taken( '_global_unique_id', $gtin, $keep_id ? $snapshot_id : 0 ) ) {
                $meta_replace['_global_unique_id'] = null;
                $notes[] = "GTIN {$gtin} in use, recovered without a GTIN";
            } else {
                psp_claim( '_global_unique_id', $gtin );
            }

            $variation_plan = [];
            foreach ( $record['variations'] as $variation ) {
                $variation_id = (int) $variation['post']['ID'];
                // A variation trashed on its own (parent live) was deliberately removed.
                if ( ! $snapshot_trash && $variation['post']['post_status'] === 'trash' ) {
                    $notes[] = "variation {$variation_id} was trashed in the snapshot, not recovered";
                    $variation_plan[] = [ 'skip' => true ];
                    continue;
                }
                // A variation still on production under this parent is re-attached, not copied.
                $existing = $wpdb->get_row( $wpdb->prepare(
                    "SELECT post_type, post_status, post_parent FROM {$wpdb->posts} WHERE ID = %d", $variation_id
                ), ARRAY_A );
                if ( $keep_id && $existing && $existing['post_type'] === 'product_variation' && (int) $existing['post_parent'] === $snapshot_id ) {
                    $notes[] = "variation {$variation_id} still on production, re-attached";
                    $variation_plan[] = [ 'reuse' => true, 'trashed' => $existing['post_status'] === 'trash' ];
                    continue;
                }
                $variation_keep = ! $existing;
                if ( ! $variation_keep ) $notes[] = "variation {$variation_id} gets a new ID";
                $replace = [];
                $vsku    = psp_meta_value( $variation['meta'], '_sku' );
                $vfree   = psp_free_sku( $vsku, $variation_keep ? $variation_id : 0 );
                if ( $vfree !== $vsku ) {
                    $replace['_sku'] = $vfree;
                    $notes[] = "variation SKU {$vsku} in use, recovered as {$vfree}";
                }
                psp_claim( '_sku', $vfree );
                $vgtin = psp_meta_value( $variation['meta'], '_global_unique_id' );
                if ( psp_meta_taken( '_global_unique_id', $vgtin, $variation_keep ? $variation_id : 0 ) ) {
                    $replace['_global_unique_id'] = null;
                    $notes[] = "variation GTIN {$vgtin} in use, recovered without a GTIN";
                } else {
                    psp_claim( '_global_unique_id', $vgtin );
                }
                $variation_plan[] = [ 'keep' => $variation_keep, 'replace' => $replace ];
            }

            // Upload files the product needs that this server doesn't have, and image
            // rows that will be re-created (an earlier run's copy is reused).
            $file_misses = psp_check_files( $record, $uploads_dir, $missing_seen, $missing_fh );
            foreach ( $record['attachments'] as $attachment ) {
                $old_id    = (int) $attachment['post']['ID'];
                $att_state = psp_prod_state( $old_id, 'attachment' );
                if ( $att_state !== 'present' && $att_state !== 'trashed' && ! psp_recovered_attachment( $old_id ) ) $att_created++;
            }

            // Review IDs already used by other comments are skipped (reported in plan too).
            $trashed_comment_status = [];
            if ( $snapshot_trash ) {
                $raw = psp_meta_value( $record['meta'], '_wp_trash_meta_comments_status' );
                $dec = $raw !== '' ? @unserialize( $raw, [ 'allowed_classes' => false ] ) : false;
                if ( is_array( $dec ) ) $trashed_comment_status = $dec;
            }
            $comment_ok = [];
            foreach ( $record['comments'] as $comment ) {
                $cid   = (int) $comment['comment']['comment_ID'];
                $taken = (bool) $wpdb->get_var( $wpdb->prepare( "SELECT comment_ID FROM {$wpdb->comments} WHERE comment_ID = %d", $cid ) );
                if ( $taken ) $notes[] = "review {$cid} skipped (ID in use)";
                $comment_ok[ $cid ] = ! $taken;
            }

            // Attribute taxonomies are created outside the transaction.
            psp_prepare_taxonomies( $record, $psp_apply, $attribute_defs, $notes );

            if ( ! $psp_apply ) {
                // Plan mode: walk product + variation terms so missing terms are reported.
                psp_attach_terms( 0, $record['terms'], false, $created_terms );
                foreach ( $record['variations'] as $i => $variation ) {
                    if ( empty( $variation_plan[ $i ]['skip'] ) && empty( $variation_plan[ $i ]['reuse'] ) ) {
                        psp_attach_terms( 0, $variation['terms'], false, $created_terms );
                    }
                }
            } else {
                $untrash_after = [];
                $wpdb->query( 'START TRANSACTION' );
                try {
                    $author = (int) $post['post_author'];
                    if ( ! get_userdata( $author ) ) $author = $psp_admin;

                    // Attachments first, so the product's image IDs point at real rows.
                    $attachment_map = [];
                    foreach ( $record['attachments'] as $attachment ) {
                        $old_id    = (int) $attachment['post']['ID'];
                        $att_state = psp_prod_state( $old_id, 'attachment' );
                        if ( $att_state === 'present' || $att_state === 'trashed' ) continue;
                        $previous_copy = psp_recovered_attachment( $old_id );
                        if ( $previous_copy ) {
                            $attachment_map[ $old_id ] = $previous_copy;
                            continue;
                        }
                        $new_att_id = psp_insert_post_row( $attachment['post'], $att_state === 'missing', [ 'post_author' => $author ] );
                        psp_insert_meta_rows( $new_att_id, $attachment['meta'], [], $PSP_SKIP_META );
                        if ( $att_state !== 'missing' ) {
                            $wpdb->insert( $wpdb->postmeta, [ 'post_id' => $new_att_id, 'meta_key' => '_psp_recovered_attachment_source', 'meta_value' => (string) $old_id ] );
                        }
                        $attachment_map[ $old_id ] = $new_att_id;
                    }

                    $remap_images = function ( $meta_rows ) use ( $attachment_map ) {
                        $replace = [];
                        foreach ( $meta_rows as $meta ) {
                            if ( $meta[0] === '_thumbnail_id' && isset( $attachment_map[ (int) $meta[1] ] ) ) {
                                $replace['_thumbnail_id'] = (string) $attachment_map[ (int) $meta[1] ];
                            }
                            if ( $meta[0] === '_product_image_gallery' && $meta[1] !== '' ) {
                                $ids = [];
                                foreach ( explode( ',', (string) $meta[1] ) as $id ) {
                                    $ids[] = isset( $attachment_map[ (int) $id ] ) ? $attachment_map[ (int) $id ] : (int) $id;
                                }
                                $replace['_product_image_gallery'] = implode( ',', $ids );
                            }
                        }
                        return $replace;
                    };

                    $new_id = psp_insert_post_row( $post, $keep_id, [ 'post_status' => 'draft', 'post_author' => $author ] );
                    psp_insert_meta_rows( $new_id, $record['meta'], array_merge( $remap_images( $record['meta'] ), $meta_replace ), $PSP_SKIP_META );
                    psp_attach_terms( $new_id, $record['terms'], true, $created_terms );

                    // Point re-created attachments at the product that owns them.
                    foreach ( $attachment_map as $att_id ) {
                        $wpdb->update( $wpdb->posts, [ 'post_parent' => $new_id ], [ 'ID' => $att_id, 'post_parent' => 0 ] );
                    }

                    $id_map = [ $snapshot_id => $new_id ];
                    foreach ( $record['variations'] as $i => $variation ) {
                        $vplan        = $variation_plan[ $i ];
                        $variation_id = (int) $variation['post']['ID'];
                        if ( ! empty( $vplan['skip'] ) ) continue;
                        if ( ! empty( $vplan['reuse'] ) ) {
                            $id_map[ $variation_id ] = $variation_id;
                            if ( $vplan['trashed'] ) $untrash_after[] = $variation_id;
                            continue;
                        }
                        $vrow = psp_untrash_row( $variation['post'], $variation['meta'], 'publish' );
                        $vid  = psp_insert_post_row( $vrow, $vplan['keep'], [ 'post_parent' => $new_id, 'post_author' => $author ] );
                        psp_insert_meta_rows( $vid, $variation['meta'], array_merge( $remap_images( $variation['meta'] ), $vplan['replace'] ), $PSP_SKIP_META );
                        psp_attach_terms( $vid, $variation['terms'], true, $created_terms );
                        $id_map[ $variation_id ] = $vid;
                        clean_post_cache( $vid );
                    }

                    foreach ( $record['comments'] as $comment ) {
                        $row = $comment['comment'];
                        if ( empty( $comment_ok[ (int) $row['comment_ID'] ] ) ) continue;
                        $row['comment_post_ID'] = $new_id;
                        if ( $row['comment_approved'] === 'post-trashed' ) {
                            $cid = (int) $row['comment_ID'];
                            $row['comment_approved'] = isset( $trashed_comment_status[ $cid ] ) ? (string) $trashed_comment_status[ $cid ] : '0';
                        }
                        if ( $wpdb->insert( $wpdb->comments, $row ) === false ) {
                            throw new Exception( 'insert review: ' . $wpdb->last_error );
                        }
                        foreach ( $comment['meta'] as $meta ) {
                            $wpdb->insert( $wpdb->commentmeta, [ 'comment_id' => (int) $row['comment_ID'], 'meta_key' => $meta[0], 'meta_value' => $meta[1] ] );
                        }
                    }

                    // Plugin rows follow the product/variation IDs actually used.
                    foreach ( $extra_tables as $table => $column ) {
                        foreach ( (array) ( $record['extra'][ $table ] ?? [] ) as $row ) {
                            $old = (int) $row[ $column ];
                            if ( ! isset( $id_map[ $old ] ) ) continue;
                            $row[ $column ] = $id_map[ $old ];
                            $exists = $wpdb->get_var( $wpdb->prepare(
                                "SELECT COUNT(*) FROM {$wpdb->prefix}{$table} WHERE {$column} = %d", (int) $row[ $column ]
                            ) );
                            if ( ! $exists && $wpdb->insert( $wpdb->prefix . $table, $row ) === false ) {
                                $notes[] = "{$table} row for {$old} not copied: " . $wpdb->last_error;
                            }
                        }
                    }

                    psp_tag_recovered( $new_id, $snapshot_id, $original_status, $PSP_RECOVERED_TAG );
                    $wpdb->query( 'COMMIT' );

                    // After commit: re-attached variations that were in the trash get their
                    // own previous status back (WooCommerce's untrash filter), then counts/caches.
                    foreach ( $untrash_after as $variation_id ) wp_untrash_post( $variation_id );
                    if ( ! empty( $record['comments'] ) ) {
                        $wpdb->query( $wpdb->prepare(
                            "UPDATE {$wpdb->posts} SET comment_count = (SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_post_ID = %d AND comment_approved = '1') WHERE ID = %d",
                            $new_id, $new_id
                        ) );
                    }
                    $ledger = psp_ledger_add( $PSP_LEDGER, $snapshot_id, $new_id );
                    clean_post_cache( $new_id );
                    wc_delete_product_transients( $new_id );
                } catch ( Throwable $e ) {
                    $wpdb->query( 'ROLLBACK' );
                    wp_cache_flush();
                    $action  = 'FAILED';
                    $new_id  = '';
                    $notes[] = $e->getMessage();
                }
            }
        }

        $totals[ $state . ' → ' . $action ] = ( $totals[ $state . ' → ' . $action ] ?? 0 ) + 1;
        fputcsv( $report, [
            $snapshot_id, $new_id, $sku, $post['post_title'], $snapshot_trash ? "trash (was {$original_status})" : $post['post_status'], $state, $action,
            count( $record['variations'] ), $att_created, $file_misses, implode( ' | ', array_unique( $notes ) ),
        ], ',', '"', '\\' );

        if ( $psp_count % 200 === 0 ) {
            psp_log( "  processed {$psp_count} products..." );
            wp_cache_flush();
        }
    }
    gzclose( $fh );
}
fclose( $report );
fclose( $missing_fh );

if ( $psp_apply ) {
    wp_defer_term_counting( false );
}

ksort( $totals );
psp_log( '== Product recovery ' . ( $psp_apply ? 'APPLY' : 'PLAN (no writes)' ) . ' ==' );
psp_log( "Snapshot export: {$header['site']} at {$header['exported_at_gmt']} UTC ({$psp_records} products, file verified)" );
foreach ( $totals as $label => $n ) {
    psp_log( sprintf( '  %-44s %d', $label, $n ) );
}
psp_log( 'Terms ' . ( $psp_apply ? 'created' : 'to create' ) . ': ' . count( $created_terms ) );
if ( $created_terms ) psp_log( '  ' . implode( ', ', array_keys( $created_terms ) ) );
psp_log( 'Upload files missing on this server (all runs of this file): ' . count( $missing_seen ) . " (list: {$missing_path})" );
psp_log( "Per-product report: {$report_path}" );
if ( $psp_apply ) {
    psp_log( 'Next: copy the missing upload files, then WooCommerce → Status → Tools → Regenerate the product lookup tables, and Regenerate the product attributes lookup table.' );
    psp_log( "Review drafts: wp-admin/edit.php?post_type=product&product_tag={$PSP_RECOVERED_TAG}&post_status=draft" );
}
