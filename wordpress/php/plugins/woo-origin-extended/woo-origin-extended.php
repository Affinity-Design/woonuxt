<?php
/*
Plugin Name: Origin List & Analytics Filters
Description: Adds a sortable + filterable "Origin" column to WooCommerce Orders list and to Analytics → Orders.
Author: Affinity Design – Paul Giovanatto
Version: 2.9
Requires Plugins: woocommerce
*/

defined( 'ABSPATH' ) || exit;

/* ───────────────────────── CONFIG ───────────────────────── */
const PG_ORIGIN_META_KEY = '_wc_order_attribution_utm_source'; // change if your store uses another key

/* ─────────────────────── HELPERS ────────────────────────── */

function pg_get_all_origins(): array {
	global $wpdb;
	// Legacy (post-based) order storage only
	$table = $wpdb->postmeta;

	// Add error handling
	$results = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT DISTINCT meta_value
			 FROM {$table}
			 WHERE meta_key = %s AND meta_value <> ''
			 ORDER BY meta_value",
			PG_ORIGIN_META_KEY
		)
	);
	
	return is_array( $results ) ? $results : array();
}

/* ═══════════════════════════════════════════════════════════
 *  PART A  –  ORDERS LIST TABLE  (legacy + HPOS, Woo 9.x)
 * ═════════════════════════════════════════════════════════ */
# 1 ▸ Column (legacy support for your setup)
add_filter( 'manage_edit-shop_order_columns', function ( $cols ) {
	$pos   = array_search( 'order_total', array_keys( $cols ), true );
	$front = array_slice( $cols, 0, $pos, true );
	$after = array_slice( $cols, $pos, null, true );
	$front['origin_sort'] = __( 'Origin', 'woocommerce' );
	return $front + $after;
}, 20 );

# 2 ▸ Cell content (legacy support)
add_action( 'manage_shop_order_posts_custom_column', function ( $column, $post_id ) {
	if ( 'origin_sort' !== $column ) {
		return;
	}
	$order = wc_get_order( $post_id );
	if ( ! $order ) {
		return;
	}
	$val = (string) $order->get_meta( PG_ORIGIN_META_KEY, true );
	echo esc_html( $val !== '' ? $val : __( 'Unknown', 'woocommerce' ) );
}, 20, 2 );

# 3 ▸ Sortable heading (legacy support)
add_filter( 'manage_edit-shop_order_sortable_columns', function ( $cols ) {
	$cols['origin_sort'] = 'origin_sort';
	return $cols;
}, 20 );

# 4 ▸ Toolbar drop-down (legacy support)
add_action( 'restrict_manage_posts', function ( $post_type ) {
	if ( 'shop_order' !== $post_type ) {
		return;
	}

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
				'key'   => PG_ORIGIN_META_KEY,
				'value' => $origin_value,
				'compare' => '='
			)
		));
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
 *  PART B  –  ANALYTICS → ORDERS  (wc-admin React screen)
 * ═════════════════════════════════════════════════════════ */

# Step 1: Handle query arguments for caching purposes (based on WC docs)
function pg_apply_origin_arg( $args ) {
	$origin = '';
	if ( isset( $_GET['pg_origin'] ) ) {
		$origin = sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) );
	}
	$args['pg_origin'] = $origin;
	return $args;
}
add_filter( 'woocommerce_analytics_orders_query_args', 'pg_apply_origin_arg' );
add_filter( 'woocommerce_analytics_orders_stats_query_args', 'pg_apply_origin_arg' );

# Step 2: Add JOIN clauses for all analytics queries (based on WC docs)
function pg_add_join_subquery( $clauses ) {
	global $wpdb;
	$clauses[] = "JOIN {$wpdb->postmeta} origin_postmeta ON {$wpdb->prefix}wc_order_stats.order_id = origin_postmeta.post_id";
	return $clauses;
}
add_filter( 'woocommerce_analytics_clauses_join_orders_subquery', 'pg_add_join_subquery' );
add_filter( 'woocommerce_analytics_clauses_join_orders_stats_total', 'pg_add_join_subquery' );
add_filter( 'woocommerce_analytics_clauses_join_orders_stats_interval', 'pg_add_join_subquery' );

# Step 3: Add WHERE clauses for filtering (based on WC docs)
function pg_add_where_subquery( $clauses ) {
	$origin = '';
	if ( isset( $_GET['pg_origin'] ) ) {
		$origin = sanitize_text_field( wp_unslash( $_GET['pg_origin'] ) );
	}
	
	if ( $origin ) {
		$escaped_meta_key = esc_sql( PG_ORIGIN_META_KEY );
		$escaped_origin = esc_sql( $origin );
		$clauses[] = "AND origin_postmeta.meta_key = '{$escaped_meta_key}' AND origin_postmeta.meta_value = '{$escaped_origin}'";
	}
	return $clauses;
}
add_filter( 'woocommerce_analytics_clauses_where_orders_subquery', 'pg_add_where_subquery' );
add_filter( 'woocommerce_analytics_clauses_where_orders_stats_total', 'pg_add_where_subquery' );
add_filter( 'woocommerce_analytics_clauses_where_orders_stats_interval', 'pg_add_where_subquery' );

# Step 4: Add SELECT clauses to include origin data (optional, for display)
function pg_add_select_subquery( $clauses ) {
	$clauses[] = ', origin_postmeta.meta_value AS origin';
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
		'2.8.3',
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
