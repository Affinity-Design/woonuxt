<?php
/*
Plugin Name: Origin List & Analytics Filters
Description: Adds a sortable + filterable "Origin" column to WooCommerce Orders list and to Analytics → Orders. Compatible with legacy post storage and High-Performance Order Storage (HPOS).
Author: Affinity Design – Paul Giovanatto
Version: 3.0
Requires Plugins: woocommerce
*/

defined( 'ABSPATH' ) || exit;

use Automattic\WooCommerce\Utilities\FeaturesUtil;
use Automattic\WooCommerce\Utilities\OrderUtil;

/* ───────────────────────── CONFIG ───────────────────────── */
const PG_ORIGIN_META_KEY = '_wc_order_attribution_utm_source'; // change if your store uses another key

/* ────────────────── HPOS COMPATIBILITY ──────────────────── */

# Declare HPOS (custom order tables) compatibility so WooCommerce doesn't flag this plugin.
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( FeaturesUtil::class ) ) {
		FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

function pg_hpos_enabled(): bool {
	return class_exists( OrderUtil::class ) && OrderUtil::custom_orders_table_usage_is_enabled();
}

/* ─────────────────────── HELPERS ────────────────────────── */

function pg_get_all_origins(): array {
	global $wpdb;

	// Read from both storage backends so the dropdown stays complete during/after
	// an HPOS migration (legacy orders keep meta in postmeta, HPOS orders in wc_orders_meta).
	$selects   = array();
	$selects[] = $wpdb->prepare(
		"SELECT DISTINCT meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value <> ''",
		PG_ORIGIN_META_KEY
	);

	$hpos_meta_table = $wpdb->prefix . 'wc_orders_meta';
	if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $hpos_meta_table ) ) === $hpos_meta_table ) {
		$selects[] = $wpdb->prepare(
			"SELECT DISTINCT meta_value FROM {$hpos_meta_table} WHERE meta_key = %s AND meta_value <> ''",
			PG_ORIGIN_META_KEY
		);
	}

	$results = $wpdb->get_col( 'SELECT DISTINCT meta_value FROM (' . implode( ' UNION ', $selects ) . ') AS origins ORDER BY meta_value' );

	return is_array( $results ) ? $results : array();
}

function pg_insert_origin_column( $cols ) {
	$pos = array_search( 'order_total', array_keys( $cols ), true );
	if ( false === $pos ) {
		$cols['origin_sort'] = __( 'Origin', 'woocommerce' );
		return $cols;
	}
	$front                = array_slice( $cols, 0, $pos, true );
	$after                = array_slice( $cols, $pos, null, true );
	$front['origin_sort'] = __( 'Origin', 'woocommerce' );
	return $front + $after;
}

function pg_echo_origin_cell( $order ): void {
	if ( ! $order instanceof WC_Order ) {
		$order = wc_get_order( $order );
	}
	if ( ! $order ) {
		return;
	}
	$val = (string) $order->get_meta( PG_ORIGIN_META_KEY, true );
	echo esc_html( $val !== '' ? $val : __( 'Unknown', 'woocommerce' ) );
}

function pg_render_origin_dropdown(): void {
	$selected = isset( $_GET['pg_origin'] ) ? sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) ) : '';
	echo '<select name="pg_origin" style="max-width:150px;margin-left:8px;">';
	echo '<option value="">' . esc_html__( 'All origins', 'woocommerce' ) . '</option>';

	foreach ( pg_get_all_origins() as $origin ) {
		printf(
			'<option value="%1$s"%3$s>%2$s</option>',
			esc_attr( $origin ),
			esc_html( $origin ),
			selected( $selected, $origin, false )
		);
	}
	echo '</select>';
}

/* ═══════════════════════════════════════════════════════════
 *  PART A1  –  ORDERS LIST TABLE  (legacy post storage)
 * ═════════════════════════════════════════════════════════ */
# 1 ▸ Column
add_filter( 'manage_edit-shop_order_columns', 'pg_insert_origin_column', 20 );

# 2 ▸ Cell content
add_action( 'manage_shop_order_posts_custom_column', function ( $column, $post_id ) {
	if ( 'origin_sort' !== $column ) {
		return;
	}
	pg_echo_origin_cell( $post_id );
}, 20, 2 );

# 3 ▸ Sortable heading
add_filter( 'manage_edit-shop_order_sortable_columns', function ( $cols ) {
	$cols['origin_sort'] = 'origin_sort';
	return $cols;
}, 20 );

# 4 ▸ Toolbar drop-down
add_action( 'restrict_manage_posts', function ( $post_type ) {
	if ( 'shop_order' !== $post_type ) {
		return;
	}
	pg_render_origin_dropdown();
}, 20 );

# 5 ▸ Query handling (filtering and sorting)
add_action( 'pre_get_posts', function ( $query ) {
	if ( ! is_admin() || ! $query->is_main_query() ) {
		return;
	}

	$screen = get_current_screen();
	if ( ! $screen || $screen->id !== 'edit-shop_order' ) {
		return;
	}

	// Handle filtering by origin
	if ( ! empty( $_GET['pg_origin'] ) ) {
		$origin_value = sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) );

		$query->set( 'meta_query', array(
			array(
				'key'     => PG_ORIGIN_META_KEY,
				'value'   => $origin_value,
				'compare' => '=',
			),
		) );
	}

	// Handle sorting by origin
	if ( isset( $_GET['orderby'] ) && $_GET['orderby'] === 'origin_sort' ) {
		$order = isset( $_GET['order'] ) && strtoupper( $_GET['order'] ) === 'DESC' ? 'DESC' : 'ASC';

		$query->set( 'meta_key', PG_ORIGIN_META_KEY );
		$query->set( 'orderby', 'meta_value' );
		$query->set( 'order', $order );
	}
} );

/* ═══════════════════════════════════════════════════════════
 *  PART A2  –  ORDERS LIST TABLE  (HPOS, woocommerce_page_wc-orders)
 * ═════════════════════════════════════════════════════════ */
# 1 ▸ Column
add_filter( 'manage_woocommerce_page_wc-orders_columns', 'pg_insert_origin_column', 20 );

# 2 ▸ Cell content (HPOS passes the WC_Order object directly)
add_action( 'manage_woocommerce_page_wc-orders_custom_column', function ( $column, $order ) {
	if ( 'origin_sort' !== $column ) {
		return;
	}
	pg_echo_origin_cell( $order );
}, 20, 2 );

# 3 ▸ Sortable heading
add_filter( 'manage_woocommerce_page_wc-orders_sortable_columns', function ( $cols ) {
	$cols['origin_sort'] = 'origin_sort';
	return $cols;
}, 20 );

# 4 ▸ Toolbar drop-down
add_action( 'woocommerce_order_list_table_restrict_manage_orders', function ( $order_type, $which ) {
	if ( 'shop_order' !== $order_type || 'top' !== $which ) {
		return;
	}
	pg_render_origin_dropdown();
}, 20, 2 );

# 5 ▸ Query handling (filtering and sorting via OrdersTableQuery args)
add_filter( 'woocommerce_order_list_table_prepare_items_query_args', function ( $query_args ) {
	if ( ! empty( $_GET['pg_origin'] ) ) {
		$query_args['meta_query'][] = array(
			'key'     => PG_ORIGIN_META_KEY,
			'value'   => sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) ),
			'compare' => '=',
		);
	}

	if ( isset( $_GET['orderby'] ) && 'origin_sort' === $_GET['orderby'] ) {
		// Named meta_query clause so OrdersTableQuery can order by the meta value
		// (same pattern as WP_Query named meta clauses).
		$query_args['meta_query']['pg_origin_clause'] = array(
			'key'     => PG_ORIGIN_META_KEY,
			'compare' => 'EXISTS',
		);
		$query_args['orderby'] = 'pg_origin_clause';
		$query_args['order']   = ( isset( $_GET['order'] ) && 'DESC' === strtoupper( $_GET['order'] ) ) ? 'DESC' : 'ASC';
	}

	return $query_args;
} );

/* ═══════════════════════════════════════════════════════════
 *  PART B  –  ANALYTICS → ORDERS  (wc-admin React screen)
 * ═════════════════════════════════════════════════════════ */

function pg_analytics_selected_origin(): string {
	return isset( $_GET['pg_origin'] ) ? sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) ) : '';
}

# Step 1: Handle query arguments for caching purposes (based on WC docs)
function pg_apply_origin_arg( $args ) {
	$args['pg_origin'] = pg_analytics_selected_origin();
	return $args;
}
add_filter( 'woocommerce_analytics_orders_query_args', 'pg_apply_origin_arg' );
add_filter( 'woocommerce_analytics_orders_stats_query_args', 'pg_apply_origin_arg' );

# Step 2: JOIN against the active order-meta table, only while a filter is set.
# v2.x joined wp_postmeta unconditionally: under HPOS that dropped orders from every
# Analytics report (HPOS orders have no postmeta rows), and on legacy storage the
# unkeyed JOIN could multiply rows. The JOIN is now keyed and conditional.
function pg_add_join_subquery( $clauses ) {
	if ( '' === pg_analytics_selected_origin() ) {
		return $clauses;
	}

	global $wpdb;
	if ( pg_hpos_enabled() ) {
		$meta_table = $wpdb->prefix . 'wc_orders_meta';
		$id_column  = 'order_id';
	} else {
		$meta_table = $wpdb->postmeta;
		$id_column  = 'post_id';
	}

	$escaped_meta_key = esc_sql( PG_ORIGIN_META_KEY );
	$clauses[]        = "JOIN {$meta_table} origin_meta ON {$wpdb->prefix}wc_order_stats.order_id = origin_meta.{$id_column} AND origin_meta.meta_key = '{$escaped_meta_key}'";
	return $clauses;
}
add_filter( 'woocommerce_analytics_clauses_join_orders_subquery', 'pg_add_join_subquery' );
add_filter( 'woocommerce_analytics_clauses_join_orders_stats_total', 'pg_add_join_subquery' );
add_filter( 'woocommerce_analytics_clauses_join_orders_stats_interval', 'pg_add_join_subquery' );

# Step 3: Add WHERE clauses for filtering (based on WC docs)
function pg_add_where_subquery( $clauses ) {
	$origin = pg_analytics_selected_origin();

	if ( $origin ) {
		$escaped_origin = esc_sql( $origin );
		$clauses[]      = "AND origin_meta.meta_value = '{$escaped_origin}'";
	}
	return $clauses;
}
add_filter( 'woocommerce_analytics_clauses_where_orders_subquery', 'pg_add_where_subquery' );
add_filter( 'woocommerce_analytics_clauses_where_orders_stats_total', 'pg_add_where_subquery' );
add_filter( 'woocommerce_analytics_clauses_where_orders_stats_interval', 'pg_add_where_subquery' );

# Step 4: Add SELECT clauses to include origin data (only valid while the JOIN exists)
function pg_add_select_subquery( $clauses ) {
	if ( '' === pg_analytics_selected_origin() ) {
		return $clauses;
	}
	$clauses[] = ', origin_meta.meta_value AS origin';
	return $clauses;
}
add_filter( 'woocommerce_analytics_clauses_select_orders_subquery', 'pg_add_select_subquery' );

# 2 ▸ Enqueue our React snippet + data
add_action( 'admin_enqueue_scripts', function () {
	// Check if we're on WooCommerce Analytics pages
	$current_screen = get_current_screen();
	if ( ! $current_screen ||
		 ( empty( $_GET['page'] ) || strpos( $_GET['page'], 'wc-' ) !== 0 ) &&
		 ( ! $current_screen || strpos( $current_screen->id, 'woocommerce' ) === false ) ) {
		return;
	}

	// Get origins data
	$origins_data = array_map(
		function( $o ) { return [ 'value' => $o, 'label' => $o ]; },
		pg_get_all_origins()
	);

	// Only enqueue if we have origin data
	if ( empty( $origins_data ) ) {
		return;
	}

	/* 2a. Enqueue the correct advanced filter implementation */
	// Main advanced filter (using correct hook from WC docs)
	wp_enqueue_script(
		'pg-origin-advanced-filter',
		plugins_url( 'advanced-filter.js', __FILE__ ),
		[ 'wp-hooks', 'wp-i18n' ],
		'3.0.0',
		true
	);

	/* 2b. Localize data for the script */
	wp_localize_script( 'pg-origin-advanced-filter', 'pgOriginData', $origins_data );
}, 20 ); // Load after WooCommerce Admin

# Step 5: Handle REST API parameter capture for Analytics endpoints
add_action( 'rest_api_init', function() {
	// Register pg_origin as a valid parameter for analytics endpoints
	$register_param = function( $args, $request ) {
		$args['pg_origin'] = array(
			'description' => __( 'Filter by order origin', 'woocommerce' ),
			'type' => 'string',
			'sanitize_callback' => 'sanitize_text_field',
			'validate_callback' => function( $param ) {
				return is_string( $param );
			}
		);
		return $args;
	};

	add_filter( 'woocommerce_rest_reports_orders_collection_params', $register_param, 10, 2 );
	add_filter( 'woocommerce_rest_reports_orders_stats_collection_params', $register_param, 10, 2 );

	// Capture the parameter from REST requests for use in SQL filters
	add_filter( 'rest_request_before_callbacks', function( $response, $handler, $request ) {
		$route = $request->get_route();
		if ( strpos( $route, '/wc-analytics/reports/orders' ) !== false ) {
			$pg_origin = $request->get_param( 'pg_origin' );
			if ( ! empty( $pg_origin ) ) {
				// Store in $_GET for use by our SQL filters
				$_GET['pg_origin'] = sanitize_text_field( $pg_origin );
			}
		}
		return $response;
	}, 10, 3 );
} );
