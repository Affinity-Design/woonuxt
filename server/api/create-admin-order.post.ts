// Admin Order Creation API - Creates orders directly via WPGraphQL with Application Password authentication
// Bypasses all session-based GraphQL issues by using admin-level authentication
// Enhanced with retry logic and better error handling for reliability
import {getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';

// Helper function for retry with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If we get a response (even an error response), return it
      // Let the caller handle HTTP errors
      return response;
    } catch (error: any) {
      lastError = error;
      console.warn(`Fetch attempt ${attempt}/${maxRetries} failed:`, getSafeErrorLogDetails(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  // Generate a unique request ID for tracing
  const requestId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🆔 Request ID: ${requestId}`);

  try {
    console.log('🛠️ Creating order via WPGraphQL with Application Password authentication...');

    const {
      billing,
      shipping,
      transactionId,
      lineItems,
      coupons = [],
      cartTotals,
      shippingMethod,
      customerNote,
      metaData = [],
      createAccount = false,
      currency = 'CAD',
      customerId,
      cardToken, // Helcim card token for native refund support
      helcimInvoiceData, // Backup data if order fails - can be used to recover
      // Client-minted id for this checkout attempt. Stable across reload/retry of the same cart
      // even though Helcim mints a new transactionId per charge — the key that lets us collapse
      // "customer paid again after an error" onto the original attempt instead of minting a
      // second order (orders 500047991/500047994 incident).
      checkoutAttemptId,
      // True when every cart item is virtual (no shippable goods): shipping-address validation is
      // skipped and the order is explicitly marked no-shipping-required instead of silently
      // carrying a blank address (mitigation plan P2-2).
      isVirtualOrder = false,
    } = body;

    // Validate required configuration
    if (!config.wpAdminUsername || !config.wpAdminAppPassword || !config.public.wpBaseUrl) {
      throw new Error('Missing WordPress Application Password credentials in configuration');
    }

    // Validate required transaction ID
    if (!transactionId) {
      console.error('❌ Missing transaction ID - cannot create order without payment reference');
      throw new Error('Transaction ID is required for order creation');
    }

    // Validate required billing fields
    const missingBillingFields: string[] = [];
    if (!billing?.firstName?.trim()) missingBillingFields.push('First Name');
    if (!billing?.lastName?.trim()) missingBillingFields.push('Last Name');
    if (!billing?.email?.trim()) missingBillingFields.push('Email');
    if (!billing?.phone?.trim()) missingBillingFields.push('Phone');

    if (missingBillingFields.length > 0) {
      console.error(`❌ Missing required billing fields: ${missingBillingFields.join(', ')}`);
      throw new Error(`Missing required billing fields: ${missingBillingFields.join(', ')}`);
    }

    // Idempotency guard: prevents duplicate order creation. Two keys, strongest first:
    //   attempt key — client-minted checkoutAttemptId, STABLE across reload/retry of the same
    //                 cart even though Helcim mints a new transactionId per charge. This is what
    //                 collapses "customer paid again after an error" onto the original attempt.
    //   charge key  — Helcim transactionId, catches re-submission of the SAME charge.
    // Records live in the dedicated payment store (NUXT_PAYMENT_DATA, legacy-cache fallback) so
    // cache clears can't wipe them. Wrapped in try/catch so order creation still works if KV
    // storage isn't configured at all.
    const idempotencyKey = `idempotency:admin-order:${transactionId}`;
    const attemptIdempotencyKey = checkoutAttemptId ? `idempotency:admin-order:attempt:${checkoutAttemptId}` : null;

    // Writes the same record under both keys so either lookup path finds it.
    const writeIdempotency = async (record: Record<string, any>) => {
      const fullRecord = {...record, transactionId, checkoutAttemptId: checkoutAttemptId || undefined};
      await paymentSetItem(idempotencyKey, fullRecord);
      if (attemptIdempotencyKey) {
        await paymentSetItem(attemptIdempotencyKey, fullRecord);
      }
    };

    try {
      const attemptIdempotency = attemptIdempotencyKey ? await paymentGetItem<any>(attemptIdempotencyKey) : null;

      if (attemptIdempotency?.status === 'completed' && attemptIdempotency?.order) {
        const isSameCharge = String(attemptIdempotency.transactionId || '') === String(transactionId);
        if (!isSameCharge) {
          // Same purchase, DIFFERENT charge: the customer paid a second time for an attempt whose
          // order already exists. Never create a second order — return the original and record
          // this charge as stranded so support can refund it from the recovery list.
          console.warn('🚨 Duplicate charge for completed attempt — returning original order, stranding duplicate charge', {
            checkoutAttemptId,
            originalTransactionId: attemptIdempotency.transactionId,
            duplicateTransactionId: transactionId,
          });
          await recordStrandedCharge(transactionId, body, `duplicate_charge_for_completed_attempt:${attemptIdempotency.transactionId}`);
          await logCheckoutFailure(event, {
            stage: 'duplicate_charge_detected',
            reason: `Second charge for completed attempt — original order returned, duplicate stranded for refund (original txn ${attemptIdempotency.transactionId})`,
            transactionId,
            checkoutAttemptId,
            email: billing?.email,
            cartTotal: cartTotals?.total,
            requestId,
          });
        } else {
          console.log('🔁 Idempotency hit (attempt): returning previously created order', {checkoutAttemptId});
        }
        return {
          success: true,
          idempotent: true,
          duplicateChargeDetected: !isSameCharge,
          order: attemptIdempotency.order,
        };
      }

      if (attemptIdempotency?.status === 'in_progress') {
        console.warn('⏳ Idempotency in-progress (attempt): ignoring duplicate request', {checkoutAttemptId});
        return {
          success: false,
          idempotent: true,
          error: 'Order creation already in progress. Please wait and refresh.',
        };
      }
      // Attempt status 'failed' (or no record): a paid charge with no order yet — proceed to create.

      const existingIdempotency = await paymentGetItem<any>(idempotencyKey);

      if (existingIdempotency?.status === 'completed' && existingIdempotency?.order) {
        console.log('🔁 Idempotency hit: returning previously created order for transactionId', transactionId);
        return {
          success: true,
          idempotent: true,
          order: existingIdempotency.order,
        };
      }

      if (existingIdempotency?.status === 'in_progress') {
        console.warn('⏳ Idempotency in-progress: ignoring duplicate request for transactionId', transactionId);
        return {
          success: false,
          idempotent: true,
          error: 'Order creation already in progress. Please wait and refresh.',
        };
      }

      await writeIdempotency({status: 'in_progress', startedAt: new Date().toISOString()});
    } catch (storageError) {
      console.warn('Idempotency storage unavailable; proceeding without duplicate protection. Sensitive details were withheld.');
    }

    // Authoritative order-level dedup against WooCommerce ITSELF. The KV idempotency above can
    // silently know nothing (namespace unbound → cache fallback wiped by cache clears, or an
    // eventual-consistency stale read on a fast retry) — that blind spot is how one purchase
    // became three orders on 2026-08-03 (500048481/84/87). Every order we create is stamped with
    // `_checkout_attempt_id`, so WooCommerce can always answer "does this attempt already have an
    // order?" regardless of our storage. Fail open on lookup errors: the charge has already
    // happened, and refusing here would strand it behind a transient search failure.
    if (checkoutAttemptId) {
      try {
        const existingOrder = await findWooOrderForAttempt({
          wpBaseUrl: config.public.wpBaseUrl,
          authHeader: `Basic ${Buffer.from(`${config.wpAdminUsername}:${config.wpAdminAppPassword}`).toString('base64')}`,
          email: billing?.email,
          checkoutAttemptId,
          transactionId,
        });

        if (existingOrder) {
          const isSameCharge = String(existingOrder.transactionId || '') === String(transactionId);
          if (!isSameCharge) {
            // Same purchase, DIFFERENT charge — the duplicate-charge case. Never create a second
            // order: return the original and strand this charge so support can refund it.
            console.warn('🚨 Woo already has an order for this attempt (different charge) — returning it, stranding duplicate charge', {
              checkoutAttemptId,
              existingOrderId: existingOrder.databaseId,
              originalTransactionId: existingOrder.transactionId,
              duplicateTransactionId: transactionId,
            });
            await recordStrandedCharge(transactionId, body, `duplicate_charge_for_existing_woo_order:${existingOrder.databaseId}`);
            await logCheckoutFailure(event, {
              stage: 'duplicate_charge_detected',
              reason: `Second charge for attempt with existing Woo order #${existingOrder.orderNumber} — original returned, duplicate stranded for refund`,
              transactionId,
              checkoutAttemptId,
              email: billing?.email,
              cartTotal: cartTotals?.total,
              requestId,
            });
          } else {
            console.log('🔁 Woo-side idempotency hit: attempt already has this order', {checkoutAttemptId, orderId: existingOrder.databaseId});
          }

          try {
            await writeIdempotency({status: 'completed', completedAt: new Date().toISOString(), order: existingOrder, adoptedFromWoo: true});
          } catch {
            // best-effort backfill of the KV record
          }

          return {
            success: true,
            idempotent: true,
            adoptedFromWoo: true,
            duplicateChargeDetected: !isSameCharge,
            order: existingOrder,
          };
        }
      } catch (wooLookupError: any) {
        console.warn('Woo-side attempt lookup failed; continuing to create. Sensitive details were withheld.');
      }
    }

    // The card has ALREADY been charged by the time we reach this handler (charge-first/order-second).
    // So any failure below leaves a stranded payment. This helper marks BOTH idempotency keys failed
    // AND persists the full payload so /api/recover-helcim-order can reconcile the charge into an
    // order without asking the customer to pay again. Best-effort — never throws into the order flow.
    const persistFailureForRecovery = async (reason: string) => {
      try {
        await writeIdempotency({status: 'failed', failedAt: new Date().toISOString(), error: reason});
      } catch (e) {
        console.warn('Failed to mark idempotency record:', getSafeErrorLogDetails(e));
      }
      await recordStrandedCharge(transactionId, body, reason);
      await logCheckoutFailure(event, {
        stage: 'order_create_failed',
        reason,
        transactionId,
        checkoutAttemptId,
        email: billing?.email,
        cartTotal: cartTotals?.total,
        requestId,
      });
    };

    // Shipping-address validation — LAST line of defense (mitigation plan P0-4). The card is
    // already charged, so a missing address must NOT silently produce a blank-shipping order
    // (2026-07-15 support incident). Refuse to create the order and persist the charge for
    // reconciliation instead. Same field set and billing fallback as the order payload below,
    // matching the client-side isShippingAddressComplete gate.
    const effectiveShipping: Record<string, string> = {
      address1: String(shipping?.address1 || billing?.address1 || '').trim(),
      city: String(shipping?.city || billing?.city || '').trim(),
      state: String(shipping?.state || billing?.state || '').trim(),
      postcode: String(shipping?.postcode || billing?.postcode || '').trim(),
      country: String(shipping?.country || billing?.country || '').trim(),
    };
    const missingShippingFields = isVirtualOrder ? [] : Object.keys(effectiveShipping).filter((field) => !effectiveShipping[field]);
    if (missingShippingFields.length > 0) {
      console.error(`❌ Missing shipping address fields [${requestId}]:`, missingShippingFields);
      await persistFailureForRecovery(`Missing shipping address fields: ${missingShippingFields.join(', ')}`);
      return {
        success: false,
        recoverable: true,
        error: 'MISSING_SHIPPING_ADDRESS',
        missingShippingFields,
        message: 'Order was not created because the shipping address is incomplete. The payment has been recorded for manual reconciliation.',
      };
    }

    // Log the request data for debugging/recovery purposes
    console.log(`📝 Order Request [${requestId}]:`, {
      transactionId,
      email: billing?.email,
      total: cartTotals?.total,
      lineItemCount: lineItems?.length || 0,
      hasCardToken: !!cardToken,
      timestamp: new Date().toISOString(),
    });

    // Log line items for debugging variation issues and pricing
    if (lineItems && lineItems.length > 0) {
      console.log(
        '📦 Processing line items for admin order:',
        JSON.stringify(
          lineItems.map((item: any) => ({
            productId: item.productId || item.product_id,
            variationId: item.variationId || item.variation_id,
            hasVariationData: !!item.variation,
            attributeCount: item.variation?.attributes?.length || 0,
            attributes: item.variation?.attributes || [],
            name: item.name,
            sku: item.sku,
            total: item.total,
            subtotal: item.subtotal,
          })),
          null,
          2,
        ),
      );
    }

    // Log cart totals to verify CAD currency
    console.log('💰 Cart totals received:', {
      subtotal: cartTotals?.subtotal,
      total: cartTotals?.total,
      totalTax: cartTotals?.totalTax,
      shippingTotal: cartTotals?.shippingTotal,
      discountTotal: cartTotals?.discountTotal,
      currency: currency,
    });

    // Helper function to parse CAD price strings to numeric values
    const parseCADPrice = (priceString: string | null): string | null => {
      if (!priceString) return null;
      // Remove currency symbols, commas, and whitespace
      const cleaned = priceString.replace(/[^0-9.\\-]/g, '');
      return cleaned || null;
    };

    // Create WordPress Application Password authentication
    const appPassword = `${config.wpAdminUsername}:${config.wpAdminAppPassword}`;
    const auth = Buffer.from(appPassword).toString('base64');

    // Build GraphQL createOrder mutation
    const mutation = `
      mutation CreateAdminOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          clientMutationId
          order {
            id
            databaseId
            orderNumber
            orderKey
            status
            total
            subtotal
            totalTax
            shippingTotal
            shippingTax
            date
            paymentMethod
            paymentMethodTitle
            transactionId
            billing {
              firstName
              lastName
              email
              phone
              address1
              city
              state
              postcode
              country
            }
            shipping {
              firstName
              lastName
              address1
              city
              state
              postcode
              country
            }
            lineItems {
              nodes {
                productId
                variationId
                quantity
                total
                subtotal
                totalTax
                product {
                  node {
                    id
                    name
                    sku
                  }
                }
                variation {
                  node {
                    id
                    name
                    sku
                  }
                }
              }
            }
            shippingLines {
              nodes {
                methodTitle
                total
              }
            }
            metaData {
              key
              value
            }
          }
        }
      }
    `;

    // Build GraphQL variables for createOrder
    const variables = {
      input: {
        clientMutationId: `admin-order-${transactionId}-${Date.now()}`,
        // CRITICAL: Use 'helcimjs' to match the Helcim Commerce for WooCommerce plugin
        // This enables native refunds via the WP admin dashboard
        paymentMethod: 'helcimjs',
        paymentMethodTitle: 'Helcim Credit Card Payment',
        transactionId: transactionId,
        status: 'PENDING', // Start as PENDING to prevent premature emails
        isPaid: false, // Do not mark as paid yet, wait for final update
        currency: currency, // Use provided currency or default to CAD
        customerId: customerId ? parseInt(customerId) : undefined,

        billing: {
          firstName: billing?.firstName || '',
          lastName: billing?.lastName || '',
          company: billing?.company || '',
          address1: billing?.address1 || '',
          address2: billing?.address2 || '',
          city: billing?.city || '',
          state: billing?.state || '',
          postcode: billing?.postcode || '',
          country: billing?.country || 'CA',
          email: billing?.email || '',
          phone: billing?.phone || '',
        },

        shipping: {
          firstName: shipping?.firstName || billing?.firstName || '',
          lastName: shipping?.lastName || billing?.lastName || '',
          company: shipping?.company || billing?.company || '',
          address1: shipping?.address1 || billing?.address1 || '',
          address2: shipping?.address2 || billing?.address2 || '',
          city: shipping?.city || billing?.city || '',
          state: shipping?.state || billing?.state || '',
          postcode: shipping?.postcode || billing?.postcode || '',
          country: shipping?.country || billing?.country || 'CA',
        },

        // Line items with complete product data including SKU and variations
        lineItems: (lineItems || []).map((item: any) => {
          const lineItem: any = {
            productId: item.productId || item.product_id,
            variationId: item.variationId || item.variation_id || null,
            quantity: item.quantity || 1,
            name: item.name || '',
            sku: item.sku || '',
            // Ensure prices are numeric CAD values (strip formatting)
            total: parseCADPrice(item.total),
            subtotal: parseCADPrice(item.subtotal),
          };

          console.log('💵 Line item pricing:', {
            name: item.name,
            originalTotal: item.total,
            parsedTotal: lineItem.total,
            originalSubtotal: item.subtotal,
            parsedSubtotal: lineItem.subtotal,
          });

          // Add variation attributes as metadata in WooCommerce format
          if (item.variation && Array.isArray(item.variation.attributes)) {
            console.log('🔍 Processing variation attributes for item:', {
              name: item.name,
              variationId: item.variationId || item.variation_id,
              attributes: item.variation.attributes,
            });

            lineItem.metaData = item.variation.attributes.map((attr: any) => {
              // WooCommerce expects attribute keys in format 'pa_size', 'pa_color', etc.
              // The attr.name should already be in the correct format from the cart
              const attributeKey = attr.name || attr.attributeName || attr.key;
              const attributeValue = attr.value || attr.attributeValue;

              console.log('  📋 Mapping attribute:', {
                originalKey: attr.name,
                finalKey: attributeKey,
                value: attributeValue,
              });

              return {
                key: attributeKey,
                value: attributeValue,
              };
            });

            console.log('✅ Final metaData for line item:', lineItem.metaData);
          }

          // Add backorder metadata if flagged (META-01)
          if (item.isBackorder) {
            const backorderMeta = {key: 'Backorder', value: 'Yes'};
            lineItem.metaData = lineItem.metaData ? [...lineItem.metaData, backorderMeta] : [backorderMeta];
          }

          return lineItem;
        }),

        // Add shipping line with costs from cart totals
        shippingLines: cartTotals?.shippingTotal
          ? [
              {
                methodId: shippingMethod?.id || shippingMethod || 'flat_rate',
                methodTitle: shippingMethod?.title || shippingMethod?.label || 'Shipping',
                // Ensure shipping total is tax-exclusive by subtracting shipping tax
                total: (() => {
                  const sTotal = parseFloat(parseCADPrice(cartTotals.shippingTotal) || '0');
                  const sTax = parseFloat(parseCADPrice(cartTotals.shippingTax) || '0');
                  return Math.max(0, sTotal - sTax).toFixed(2);
                })(),
              },
            ]
          : [],

        customerNote: customerNote || '',

        metaData: [
          {key: '_created_via', value: 'woonuxt_admin_api'},
          // CRITICAL: Store transaction ID in both standard WooCommerce format AND Helcim-specific format
          // The Helcim plugin uses _transaction_id for refund lookups
          {key: '_transaction_id', value: transactionId},
          {key: '_helcim_transaction_id', value: transactionId},
          // CRITICAL: The purchase identity. Lets WooCommerce itself answer "does this checkout
          // attempt already have an order?" (see findWooOrderForAttempt) even when every KV/D1
          // record is gone — the storage-independent half of the duplicate-order guard.
          ...(checkoutAttemptId ? [{key: '_checkout_attempt_id', value: String(checkoutAttemptId)}] : []),
          // CRITICAL: Use 'helcimjs' to match the Helcim WooCommerce plugin for native refunds
          {key: '_payment_method', value: 'helcimjs'},
          {key: '_payment_method_title', value: 'Helcim Credit Card Payment'},
          // CRITICAL: Store card token for native refund support via WP admin
          // Store in multiple formats to ensure Helcim plugin can find it
          ...(cardToken
            ? [
                {key: 'helcim-card-token', value: cardToken},
                {key: '_helcim_card_token', value: cardToken},
              ]
            : []),
          {key: '_paid_date', value: new Date().toISOString()},
          {key: '_transaction_paid', value: '1'},
          {key: '_order_source', value: 'proskatersplace.ca'},
          {key: '_customer_source', value: 'proskatersplace.ca'},
          {key: '_order_via', value: 'WooNuxt'},
          // Blank shipping on this order is intentional (all-virtual cart), not a validation gap.
          ...(isVirtualOrder ? [{key: '_psp_no_shipping_required', value: 'yes'}] : []),
          // Mark order as created via API for email template handling
          {key: '_created_via_api', value: 'woonuxt'},
          // Add cart totals as metadata for reference (entity-decoded: Woo emits "$2.25&nbsp;CAD")
          {key: '_cart_subtotal', value: cleanPriceText(cartTotals?.subtotal) || '0'},
          {key: '_cart_total', value: cleanPriceText(cartTotals?.total) || '0'},
          {key: '_cart_total_tax', value: cleanPriceText(cartTotals?.totalTax) || '0'},
          {key: '_cart_shipping_total', value: cleanPriceText(cartTotals?.shippingTotal) || '0'},
          {key: '_cart_shipping_tax', value: cleanPriceText(cartTotals?.shippingTax) || '0'},
          ...metaData,
        ],
      },
    };

    console.log('📋 Order data prepared:', {
      clientMutationId: variables.input.clientMutationId,
      lineItemCount: variables.input.lineItems.length,
      appliedCoupons: coupons?.length || 0,
      requestId: requestId,
    });

    // Make GraphQL request with Application Password authentication
    // Uses retry logic for better reliability
    const graphqlUrl = `${config.public.wpBaseUrl}/graphql`;
    console.log('🌐 Making authenticated GraphQL order request. Backend URL was withheld.');

    const response = await fetchWithRetry(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'WooNuxt-Admin-Order-Creator/1.0',
        Origin: config.public.wpBaseUrl, // Match the WordPress origin
        Referer: config.public.wpBaseUrl, // Set referrer to WordPress site
        'X-Requested-With': 'XMLHttpRequest', // Indicate AJAX request
        'X-Request-ID': requestId, // Include request ID for tracing
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables,
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      console.error(`❌ GraphQL HTTP Error [${requestId}]:`, {
        status: response.status,
        statusText: response.statusText,
      });

      await persistFailureForRecovery(`GraphQL HTTP Error: ${response.status} - ${response.statusText}`);
      return {
        success: false,
        recoverable: true,
        error: 'Your payment was received, but we could not finish creating the order automatically. Do not pay again; contact customer service.',
        requestId,
      };
    }

    const result = await response.json().catch(async () => {
      await response.clone().text().catch(() => '');
      console.error(`GraphQL response is not JSON [${requestId}]. Response body was withheld.`);
      return {_parseError: true};
    });

    if (result._parseError) {
      await persistFailureForRecovery('GraphQL returned non-JSON response');
      return {
        success: false,
        recoverable: true,
        error: 'Your payment was received, but we could not finish creating the order automatically. Do not pay again; contact customer service.',
        requestId,
      };
    }

    // Check for GraphQL errors
    if (result.errors) {
      console.error(`GraphQL order mutation failed [${requestId}]. Sensitive details were withheld.`);
      await persistFailureForRecovery('GraphQL mutation failed');
      return {
        success: false,
        recoverable: true,
        error: 'Your payment was received, but we could not finish creating the order automatically. Do not pay again; contact customer service.',
        requestId,
      };
    }

    const orderData = result.data?.createOrder?.order;
    if (!orderData) {
      console.error('❌ No order data returned from GraphQL mutation');
      await persistFailureForRecovery('No order data returned from GraphQL');
      return {
        success: false,
        recoverable: true,
        error: 'Your payment was received, but we could not finish creating the order automatically. Do not pay again; contact customer service.',
        requestId,
      };
    }

    console.log('✅ TEST ORDER created successfully via GraphQL:', {
      orderId: orderData.databaseId,
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      total: orderData.total,
    });

    // Line items are already created by GraphQL mutation with all necessary data
    // No need to update them separately to avoid duplicates
    console.log('✅ Order created with complete line items via GraphQL');

    // Mark the attempt completed the MOMENT the order exists — before the settle delay and
    // status update below, which historically stretched this endpoint past client timeouts.
    // If the response is lost from here on, a retry/recovery finds a completed record with the
    // order instead of racing an 'in_progress' marker (and the final write below refreshes it
    // with the finalized order number).
    try {
      await writeIdempotency({
        status: 'completed',
        completedAt: new Date().toISOString(),
        order: {
          id: orderData.databaseId,
          databaseId: orderData.databaseId,
          globalId: orderData.id,
          orderNumber: orderData.orderNumber,
          orderKey: orderData.orderKey,
          status: orderData.status,
          total: orderData.total,
          transactionId: orderData.transactionId,
          paymentMethod: orderData.paymentMethod,
          date: orderData.date,
        },
      });
    } catch (storageError) {
      console.warn('Failed to write early idempotency completion; continuing. Sensitive details were withheld.');
    }

    // Step 1: SKIP Applying coupons to avoid double-discounting logic
    // Since we already calculated the discounted totals in the line items, applying coupons again via API
    // triggers a re-calculation that corrupts the totals (e.g. 0.85 -> 0.74).
    // We will just update status.

    let finalizedOrderNumber = orderData.orderNumber;

    try {
      /*
      console.log('🔄 Step 1: Applying coupons and recalculating...');

      // Prepare the coupon update payload
      const couponPayload: any = {
        currency: currency,
        meta_data: [
          {
            key: '_email_fix_applied',
            value: new Date().toISOString(),
          },
        ],
      };

      // Add coupons if present
      if (coupons && coupons.length > 0) {
        console.log(`🎫 Adding ${coupons.length} coupons to payload...`);
        couponPayload.coupon_lines = coupons.map((c: any) => ({
          code: c.code,
        }));
      }

      // Wait a moment to ensure GraphQL creation is fully settled in DB
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const couponResponse = await fetch(`${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WooNuxt-Test-GraphQL-Creator/1.0',
        },
        body: JSON.stringify(couponPayload),
      });

      if (!couponResponse.ok) {
        const errorText = await couponResponse.text();
        console.warn('Failed to apply coupons. Upstream response details were withheld.');
      } else {
        console.log('✅ Coupons applied and totals recalculated');
      }
      */

      console.log('🔄 Skipped coupon application to preserve manual line totals.');

      // Step 2: Update status to processing and ensure transaction_id is stored correctly
      console.log('🔄 Step 2: Updating status to processing...');

      // Delay to ensure DB write completes and totals are stable
      // User requested longer wait to guarantee correctness
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Build meta_data array for the REST API update
      // This ensures WooCommerce stores these in the standard format for the Helcim plugin
      const statusMetaData: Array<{key: string; value: string}> = [
        {
          key: '_order_completed_processing',
          value: 'true',
        },
        // Ensure transaction_id is stored in WooCommerce standard location
        {
          key: '_transaction_id',
          value: transactionId,
        },
      ];

      // Add cardToken for Helcim native refund support if available
      // Store in multiple formats to ensure Helcim plugin can find it
      if (cardToken) {
        statusMetaData.push({key: 'helcim-card-token', value: cardToken}, {key: '_helcim_card_token', value: cardToken});
        console.log('✅ Including cardToken in status update for refund support');
      }

      const statusPayload = {
        status: 'processing',
        set_paid: true,
        // Set transaction_id at the order level (required by WooCommerce for refunds)
        transaction_id: transactionId,
        // Set payment_method to match Helcim plugin
        payment_method: 'helcimjs',
        payment_method_title: 'Helcim Credit Card Payment',
        meta_data: statusMetaData,
      };

      // Use retry for status update to ensure it completes
      const statusResponse = await fetchWithRetry(
        `${config.public.wpBaseUrl}/wp-json/wc/v3/orders/${orderData.databaseId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WooNuxt-Admin-Order-Creator/1.0',
            'X-Request-ID': requestId,
            // Cloudflare Workers may ignore/strip User-Agent; use a custom header for tracing.
            'X-WooNuxt-Source': 'create-admin-order',
            'X-WooNuxt-Step': 'set-processing',
            'X-WooNuxt-Transaction-Id': String(transactionId),
          },
          body: JSON.stringify(statusPayload),
        },
        2, // Fewer retries for status update
      );

      if (statusResponse.ok) {
        const updatedOrder = await statusResponse
          .clone()
          .json()
          .catch(() => null);
        if (updatedOrder?.number) {
          finalizedOrderNumber = String(updatedOrder.number);
          console.log('Final order number from Woo REST:', finalizedOrderNumber);
        }
        console.log('✅ Order status updated to processing (Email triggered)');
      } else {
        const errorText = await statusResponse.text();
        console.warn('Failed to update order status. Upstream response details were withheld.');
      }
    } catch (finalError: any) {
      console.warn('Failed to finalize order. Sensitive details were withheld.');
    }

    const responsePayload = {
      success: true,
      message: '🎉 Order created successfully!',
      requestId: requestId,
      order: {
        id: orderData.databaseId,
        databaseId: orderData.databaseId,
        globalId: orderData.id,
        orderNumber: finalizedOrderNumber,
        orderKey: orderData.orderKey,
        status: orderData.status,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        date: orderData.date,
      },
      nextSteps: [
        '✅ Order successfully created with admin authentication',
        '✅ Payment method and transaction ID recorded',
        '✅ Customer billing and shipping information saved',
        '✅ Line items and metadata properly stored',
        '🔗 Redirect to order confirmation page',
      ],
    };

    try {
      await writeIdempotency({
        status: 'completed',
        completedAt: new Date().toISOString(),
        order: responsePayload.order,
      });
    } catch (storageError) {
      console.warn('Failed to write idempotency completion:', getSafeErrorLogDetails(storageError));
    }

    return responsePayload;
  } catch (error: any) {
    console.error(`Admin order creation failed [${requestId}]:`, getSafeErrorLogDetails(error));

    // Best-effort mark both idempotency keys as failed (if we had a transactionId)
    try {
      if (body?.transactionId) {
        const failureRecord = {
          status: 'failed',
          transactionId: body.transactionId,
          checkoutAttemptId: body?.checkoutAttemptId || undefined,
          failedAt: new Date().toISOString(),
          error: 'Admin order creation failed. Sensitive details were withheld.',
        };
        await paymentSetItem(`idempotency:admin-order:${body.transactionId}`, failureRecord);
        if (body?.checkoutAttemptId) {
          await paymentSetItem(`idempotency:admin-order:attempt:${body.checkoutAttemptId}`, failureRecord);
        }
      }
    } catch {
      // ignore
    }

    // The charge already succeeded in Helcim — persist the recovery payload after the recovery
    // store removes account credentials. This prevents the customer from being stranded.
    await recordStrandedCharge(body?.transactionId, body, 'Admin order creation threw. Sensitive details were withheld.');

    // The transaction succeeded in Helcim, but WordPress order creation failed.
    // Return only the identifiers the recovery flow needs; keep diagnostics server-side.
    return {
      success: false,
      recoverable: !!body?.transactionId,
      error: 'Your payment was received, but we could not finish creating the order automatically. Do not pay again; contact customer service.',
      requestId,
      transactionId: body.transactionId,
    };
  }
});
