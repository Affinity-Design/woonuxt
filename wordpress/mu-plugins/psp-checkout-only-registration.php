<?php
/**
 * Plugin Name: PSP Checkout-Only Account Registration
 * Description: Blocks every standalone public registration path while preserving account creation inside a real checkout.
 * Version: 1.0.0
 * Author: ProSkatersPlace
 *
 * Shared-backend policy for proskatersplace.com and proskatersplace.ca.
 * Install as: wp-content/mu-plugins/psp-checkout-only-registration.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PSP_REGISTRATION_BLOCKED_CODE = 'psp_checkout_only_registration';

/**
 * Keep WordPress core, multisite, and WooCommerce My Account registration off.
 */
add_filter( 'pre_option_users_can_register', '__return_false', PHP_INT_MAX );
add_filter( 'option_users_can_register', '__return_false', PHP_INT_MAX );
add_filter( 'pre_update_option_users_can_register', '__return_false', PHP_INT_MAX );

add_filter( 'pre_site_option_registration', 'psp_disable_network_registration', PHP_INT_MAX );
add_filter( 'site_option_registration', 'psp_disable_network_registration', PHP_INT_MAX );
add_filter( 'pre_update_site_option_registration', 'psp_disable_network_registration', PHP_INT_MAX );

add_filter( 'pre_option_woocommerce_enable_myaccount_registration', 'psp_disable_my_account_registration', PHP_INT_MAX );
add_filter( 'option_woocommerce_enable_myaccount_registration', 'psp_disable_my_account_registration', PHP_INT_MAX );
add_filter( 'pre_update_option_woocommerce_enable_myaccount_registration', 'psp_disable_my_account_registration', PHP_INT_MAX );

/**
 * @return string
 */
function psp_disable_network_registration() {
	return 'none';
}

/**
 * @return string
 */
function psp_disable_my_account_registration() {
	return 'no';
}

/**
 * Remove the two standalone public GraphQL registration mutations. Checkout
 * remains registered and may still create a customer while it creates an order.
 */
add_action(
	'graphql_register_types',
	function () {
		if ( ! function_exists( 'deregister_graphql_field' ) ) {
			return;
		}

		deregister_graphql_field( 'RootMutation', 'registerUser' );
		deregister_graphql_field( 'RootMutation', 'registerCustomer' );
	},
	PHP_INT_MAX
);

/**
 * Block the native wp-login.php registration handler even if another plugin
 * bypasses or rewrites the registration option.
 *
 * @param WP_Error $errors Existing registration errors.
 * @return WP_Error
 */
function psp_block_core_registration( $errors ) {
	if ( ! is_wp_error( $errors ) ) {
		$errors = new WP_Error();
	}

	$errors->add(
		PSP_REGISTRATION_BLOCKED_CODE,
		__( 'Accounts can only be created while placing an order.', 'psp-checkout-registration' )
	);
	psp_log_blocked_registration( 'wordpress-core' );

	return $errors;
}
add_filter( 'registration_errors', 'psp_block_core_registration', PHP_INT_MAX, 1 );

/**
 * Read the GraphQL document for the current request without trusting the
 * operation name or client-provided headers.
 *
 * @return string
 */
function psp_current_graphql_document() {
	static $document = null;

	if ( null !== $document ) {
		return $document;
	}

	$document = '';
	$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
	if ( false === strpos( $request_uri, '/graphql' ) ) {
		return $document;
	}

	$raw_body = file_get_contents( 'php://input' );
	if ( ! is_string( $raw_body ) ) {
		return $document;
	}

	$body = json_decode( $raw_body, true );
	if ( is_array( $body ) && isset( $body['query'] ) && is_string( $body['query'] ) ) {
		$document = $body['query'];
	}

	return $document;
}

/**
 * Determine whether WooCommerce is creating the customer as part of checkout.
 *
 * @return bool
 */
function psp_is_checkout_account_creation() {
	if ( defined( 'WP_CLI' ) && WP_CLI ) {
		return true;
	}

	if ( current_user_can( 'manage_woocommerce' ) || current_user_can( 'edit_shop_orders' ) ) {
		return true;
	}

	$order_creation_hooks = array(
		'woocommerce_checkout_create_order',
		'woocommerce_store_api_checkout_update_order_from_request',
		'woocommerce_new_order',
	);
	foreach ( $order_creation_hooks as $order_creation_hook ) {
		if ( doing_action( $order_creation_hook ) ) {
			return true;
		}
	}

	$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
	if ( false !== strpos( $request_uri, '/wc/store/' ) && false !== strpos( $request_uri, '/checkout' ) ) {
		return true;
	}

	if ( false !== strpos( $request_uri, 'wc-ajax=checkout' ) ) {
		return true;
	}

	$graphql_document = psp_current_graphql_document();
	if ( '' !== $graphql_document ) {
		$contains_checkout = (bool) preg_match( '/\bcheckout\s*\(/i', $graphql_document );
		$contains_standalone_registration = (bool) preg_match( '/\bregister(?:User|Customer)\s*\(/i', $graphql_document );

		return $contains_checkout && ! $contains_standalone_registration;
	}

	return false;
}

/**
 * Backstop wc_create_new_customer() so direct calls cannot bypass hidden forms
 * or GraphQL schema restrictions.
 *
 * @param WP_Error $errors Existing WooCommerce registration errors.
 * @return WP_Error
 */
function psp_block_non_checkout_customer_registration( $errors ) {
	if ( psp_is_checkout_account_creation() ) {
		return $errors;
	}

	if ( ! is_wp_error( $errors ) ) {
		$errors = new WP_Error();
	}

	$errors->add(
		PSP_REGISTRATION_BLOCKED_CODE,
		__( 'Accounts can only be created while placing an order.', 'psp-checkout-registration' )
	);
	psp_log_blocked_registration( 'woocommerce' );

	return $errors;
}
add_filter( 'woocommerce_registration_errors', 'psp_block_non_checkout_customer_registration', PHP_INT_MAX, 1 );

/**
 * Write a concise security event without storing submitted usernames or email.
 *
 * @param string $channel Registration surface that was blocked.
 * @return void
 */
function psp_log_blocked_registration( $channel ) {
	$connecting_ip = isset( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ) ) : '';
	$remote_ip     = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$request_uri   = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
	$ip_address    = $connecting_ip ? $connecting_ip : $remote_ip;

	error_log(
		sprintf(
			'[PSP Registration Policy] blocked channel=%s ip=%s uri=%s',
			sanitize_key( $channel ),
			$ip_address,
			$request_uri
		)
	);
}
