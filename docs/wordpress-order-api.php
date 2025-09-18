// Create this WordPress REST API endpoint as an alternative to GraphQL
// Add this to your WordPress functions.php or as a plugin

add_action('rest_api_init', function () {
    register_rest_route('woonuxt/v1', '/create-order', array(
        'methods' => 'POST',
        'callback' => 'create_helcim_order',
        'permission_callback' => '__return_true', // Adjust security as needed
    ));
});

function create_helcim_order($request) {
    // Get the data from the request
    $params = $request->get_json_params();
    
    // Create the order
    $order = wc_create_order();
    
    // Set payment method
    $order->set_payment_method('cod');
    $order->set_payment_method_title('Cash on Delivery (Paid via Helcim)');
    
    // Set customer details
    if (isset($params['billing'])) {
        $billing = $params['billing'];
        $order->set_billing_first_name($billing['firstName'] ?? '');
        $order->set_billing_last_name($billing['lastName'] ?? '');
        $order->set_billing_email($billing['email'] ?? '');
        $order->set_billing_phone($billing['phone'] ?? '');
        $order->set_billing_address_1($billing['address1'] ?? '');
        $order->set_billing_city($billing['city'] ?? '');
        $order->set_billing_state($billing['state'] ?? '');
        $order->set_billing_postcode($billing['postcode'] ?? '');
        $order->set_billing_country($billing['country'] ?? '');
    }
    
    // Add cart items
    if (isset($params['cartItems'])) {
        foreach ($params['cartItems'] as $item) {
            $order->add_product(wc_get_product($item['productId']), $item['quantity']);
        }
    }
    
    // Add Helcim transaction metadata
    if (isset($params['transactionId'])) {
        $order->add_meta_data('_helcim_transaction_id', $params['transactionId']);
        $order->add_meta_data('_transaction_id', $params['transactionId']);
    }
    
    // Set order as paid
    $order->set_status('processing');
    $order->payment_complete($params['transactionId'] ?? '');
    
    // Save the order
    $order->save();
    
    return array(
        'success' => true,
        'orderId' => $order->get_id(),
        'orderNumber' => $order->get_order_number(),
    );
}
