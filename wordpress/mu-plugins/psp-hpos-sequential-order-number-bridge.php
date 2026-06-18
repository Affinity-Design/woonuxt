<?php
/**
 * Plugin Name: PSP HPOS Sequential Order Number Bridge
 * Description: Ensures HPOS/API-created WooNuxt orders receive SkyVerge Sequential Order Numbers.
 * Version: 1.0.0
 *
 * Upload to: wp-content/mu-plugins/
 */

defined( 'ABSPATH' ) || exit;

add_action( 'woocommerce_new_order', 'psp_assign_missing_sequential_order_number_for_hpos_order', 20, 2 );
add_action( 'woocommerce_update_order', 'psp_assign_missing_sequential_order_number_for_hpos_order', 20, 2 );

/**
 * Restores legacy-style coverage for programmatic orders after HPOS is enabled.
 *
 * SkyVerge Sequential Order Numbers handles classic checkout, admin saves, and
 * Store API checkout under HPOS. WooNuxt creates Helcim orders through
 * WPGraphQL, so we call the plugin's own assignment helper when an HPOS order
 * is missing the `_order_number` meta.
 */
function psp_assign_missing_sequential_order_number_for_hpos_order( $order_id, $order = null ): bool {
	static $orders_in_progress = [];

	if ( ! function_exists( 'wc_sequential_order_numbers' ) || ! psp_hpos_order_tables_are_active() ) {
		return false;
	}

	if ( ! $order instanceof WC_Order ) {
		$order = wc_get_order( $order_id );
	}

	if ( ! $order instanceof WC_Order || 'shop_order' !== $order->get_type() ) {
		return false;
	}

	$order_id = (int) $order->get_id();

	if ( $order_id <= 0 || isset( $orders_in_progress[ $order_id ] ) ) {
		return false;
	}

	if ( in_array( $order->get_status(), [ 'auto-draft', 'draft' ], true ) ) {
		return false;
	}

	if ( psp_order_already_has_sequential_order_number( $order ) ) {
		return false;
	}

	$orders_in_progress[ $order_id ] = true;

	try {
		$sequential_order_numbers = wc_sequential_order_numbers();

		if ( is_object( $sequential_order_numbers ) && is_callable( [ $sequential_order_numbers, 'set_sequential_order_number' ] ) ) {
			$sequential_order_numbers->set_sequential_order_number( $order_id, $order );
		}
	} catch ( Throwable $exception ) {
		error_log(
			sprintf(
				'PSP order number bridge failed for order ID %d: %s',
				$order_id,
				$exception->getMessage()
			)
		);
	} finally {
		unset( $orders_in_progress[ $order_id ] );
	}

	$refreshed_order = wc_get_order( $order_id );

	return $refreshed_order instanceof WC_Order && psp_order_already_has_sequential_order_number( $refreshed_order );
}

/**
 * Checks whether WooCommerce HPOS custom order tables are authoritative.
 */
function psp_hpos_order_tables_are_active(): bool {
	return class_exists( '\Automattic\WooCommerce\Utilities\OrderUtil' )
		&& \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
}

/**
 * Reads the raw sequential order number meta without falling back to the order ID.
 */
function psp_order_already_has_sequential_order_number( WC_Order $order ): bool {
	return '' !== (string) $order->get_meta( '_order_number', true, 'edit' );
}

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	WP_CLI::add_command( 'psp-order-numbers backfill', 'psp_backfill_missing_sequential_order_numbers_command' );
}

/**
 * Backfills existing HPOS orders that were created before this bridge was installed.
 *
 * Usage:
 *   wp psp-order-numbers backfill --dry-run
 *   wp psp-order-numbers backfill --limit=250
 */
function psp_backfill_missing_sequential_order_numbers_command( array $args, array $assoc_args ): void {
	$dry_run = (bool) WP_CLI\Utils\get_flag_value( $assoc_args, 'dry-run', false );
	$limit   = isset( $assoc_args['limit'] ) ? max( 1, (int) $assoc_args['limit'] ) : 100;

	if ( ! function_exists( 'wc_get_orders' ) ) {
		WP_CLI::error( 'WooCommerce is not loaded.' );
	}

	if ( ! function_exists( 'wc_sequential_order_numbers' ) ) {
		WP_CLI::error( 'Sequential Order Numbers for WooCommerce is not active.' );
	}

	if ( ! psp_hpos_order_tables_are_active() ) {
		WP_CLI::error( 'HPOS custom order tables are not active.' );
	}

	$orders = wc_get_orders(
		[
			'type'       => 'shop_order',
			'status'     => array_keys( wc_get_order_statuses() ),
			'limit'      => $limit,
			'orderby'    => 'ID',
			'order'      => 'ASC',
			'return'     => 'objects',
			'meta_query' => [
				[
					'key'     => '_order_number',
					'compare' => 'NOT EXISTS',
				],
			],
		]
	);

	$processed = 0;
	$repaired  = 0;

	foreach ( $orders as $order ) {
		if ( ! $order instanceof WC_Order || in_array( $order->get_status(), [ 'auto-draft', 'draft' ], true ) ) {
			continue;
		}

		$processed++;

		if ( $dry_run ) {
			WP_CLI::line( sprintf( 'Would assign sequential number to order ID %d.', $order->get_id() ) );
			continue;
		}

		if ( psp_assign_missing_sequential_order_number_for_hpos_order( $order->get_id(), $order ) ) {
			$refreshed_order = wc_get_order( $order->get_id() );
			$repaired++;
			WP_CLI::line(
				sprintf(
					'Assigned #%s to order ID %d.',
					$refreshed_order instanceof WC_Order ? $refreshed_order->get_order_number() : $order->get_id(),
					$order->get_id()
				)
			);
		} else {
			WP_CLI::warning( sprintf( 'Could not assign a sequential number to order ID %d.', $order->get_id() ) );
		}
	}

	if ( $dry_run ) {
		WP_CLI::success( sprintf( 'Dry run complete. %d order(s) would be checked.', $processed ) );
		return;
	}

	WP_CLI::success( sprintf( 'Backfill complete. %d of %d checked order(s) repaired.', $repaired, $processed ) );
}
