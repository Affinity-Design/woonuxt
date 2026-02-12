<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, watchEffect, nextTick} from 'vue';
import VueTurnstile from 'vue-turnstile';
import {convertToCAD} from '~/utils/priceConverter';

const {t} = useI18n();
const {query} = useRoute();
const {cart, isUpdatingCart, paymentGateways, refreshCart} = useCart();
const {customer, viewer} = useAuth();
const {orderInput, isProcessingOrder, processCheckout, updateShippingLocation} = useCheckout();
const {exchangeRate} = useExchangeRate();
const config = useRuntimeConfig();

// Refs for managing checkout state
const buttonText = ref<string>(isProcessingOrder.value ? t('messages.general.processing') : t('messages.shop.checkoutButton'));
const isCheckoutDisabled = computed<boolean>(() => isProcessingOrder.value || isUpdatingCart.value);

const isInvalidEmail = ref<boolean>(false);
const isPaid = ref<boolean>(false);
const paymentError = ref<string | null>(null);
const isSubmitting = ref<boolean>(false);
const helcimCardRef = ref<any>(null);
const turnstileWidget = ref<any>(null);

// Turnstile state
const turnstileToken = ref<string>('');
const turnstileError = ref<string>('');
const isTurnstileEnabled = computed(() => {
  return config.public.turnstile?.siteKey && process.env.TURNSTILE_ENABLED !== 'false';
});

// Helcim payment state
const helcimPaymentComplete = ref<boolean>(false);
const helcimTransactionData = ref<any>(null);
const helcimCardToken = ref<string>(''); // Card token required for refunds via WP admin
const isCreatingOrder = ref<boolean>(false);
const orderCreationMessage = ref<string>('');
const helcimModalClosed = ref<boolean>(false); // Track if user closed modal

// Fallback Helcim payment gateway - used when paymentGateways doesn't load properly
const fallbackHelcimGateway = {
  id: 'cod',
  title: 'Helcim Payment',
  description: 'Secure payment processing via Helcim',
};

// Effective payment gateways - ensures Helcim is always available
const effectivePaymentGateways = computed(() => {
  // If paymentGateways has nodes with Helcim, use them
  if (paymentGateways.value?.nodes?.length) {
    const helcimGateway = paymentGateways.value.nodes.find((g: any) => g.id === 'cod' && g.title?.includes('Helcim'));
    if (helcimGateway) {
      return paymentGateways.value;
    }
  }
  // Otherwise, return fallback with Helcim only
  console.log('[Checkout] Using fallback payment gateways (Helcim only)');
  return {
    nodes: [fallbackHelcimGateway],
  };
});

// Ensure Helcim is always selected - this is the ONLY payment method we support
const ensureHelcimSelected = () => {
  if (!orderInput.value.paymentMethod?.id || !orderInput.value.paymentMethod?.title?.includes('Helcim')) {
    console.log('[Checkout] Ensuring Helcim payment method is selected');
    orderInput.value.paymentMethod = fallbackHelcimGateway;
  }
};

// Auto-select Helcim on component mount
onMounted(() => {
  // Ensure Helcim is selected immediately
  ensureHelcimSelected();

  // Also set up a watcher to ensure it stays selected
  watch(
    () => paymentGateways.value,
    (newGateways) => {
      console.log('[Checkout] paymentGateways changed:', newGateways?.nodes?.length || 0, 'gateways');
      // Even if gateways load, ensure Helcim stays selected
      nextTick(() => {
        ensureHelcimSelected();
      });
    },
    {immediate: true},
  );
});

// Auto-fill customer details from viewer if available
watchEffect(() => {
  if (viewer.value && customer.value && customer.value.billing) {
    if (!customer.value.billing.firstName && viewer.value.firstName) {
      customer.value.billing.firstName = viewer.value.firstName;
    }
    if (!customer.value.billing.lastName && viewer.value.lastName) {
      customer.value.billing.lastName = viewer.value.lastName;
    }
    if (!customer.value.billing.email && viewer.value.email) {
      customer.value.billing.email = viewer.value.email;
    }

    // Also prefill shipping name if empty
    if (customer.value.shipping) {
      if (!customer.value.shipping.firstName && viewer.value.firstName) {
        customer.value.shipping.firstName = viewer.value.firstName;
      }
      if (!customer.value.shipping.lastName && viewer.value.lastName) {
        customer.value.shipping.lastName = viewer.value.lastName;
      }
    }
  }
});

// Watch for cart updates and preserve Helcim payment state
watch(
  () => cart.value,
  (newCart, oldCart) => {
    if (newCart && oldCart && helcimPaymentComplete.value) {
      console.log('[Checkout] Cart updated, preserving Helcim payment state');
      // Ensure payment method stays selected after cart updates
      nextTick(() => {
        if (orderInput.value.paymentMethod?.title?.includes('Helcim')) {
          console.log('[Checkout] Helcim payment method preserved after cart update');
        }
      });
    }
  },
  {deep: true},
);

// Listen for Helcim modal close events to reset button state
const helcimModalCloseHandler = (event: MessageEvent) => {
  // Log ALL postMessage events to debug
  if (event.data?.eventName) {
    console.log('[Checkout] Received postMessage event:', {
      eventName: event.data.eventName,
      eventStatus: event.data.eventStatus,
      fullData: event.data,
    });
  }

  // Check for Helcim modal close event - the eventName contains the checkout token
  // So we check if it starts with 'helcim-pay-js-' and has status 'HIDE'
  if (event.data?.eventName?.startsWith('helcim-pay-js-') && event.data.eventStatus === 'HIDE') {
    console.log('[Checkout] ✅ Helcim modal was closed by user');
    console.log('[Checkout] Current state:', {
      isSubmitting: isSubmitting.value,
      helcimPaymentComplete: helcimPaymentComplete.value,
      paymentMethodId: orderInput.value.paymentMethod?.id,
    });

    // Set flag to stop payment waiting loop
    helcimModalClosed.value = true;
    console.log('[Checkout] Set helcimModalClosed flag to TRUE');

    // ALWAYS reset button state when modal closes without payment completion
    // This ensures the button is clickable for retry
    if (!helcimPaymentComplete.value) {
      console.log('[Checkout] Resetting button state after modal close');
      isSubmitting.value = false;
      buttonText.value = t('messages.shop.placeOrder');
      paymentError.value = null; // Clear any errors to allow retry
    }

    console.log('[Checkout] After modal close - isSubmitting:', isSubmitting.value);
  }
};

// Register event listener at component level
if (typeof window !== 'undefined') {
  window.addEventListener('message', helcimModalCloseHandler);
}

// Cleanup on unmount
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('message', helcimModalCloseHandler);
  }
});

// Handle form submission
const payNow = async () => {
  // Prevent multiple simultaneous submissions
  if (isSubmitting.value) {
    console.log('[payNow] Already processing, ignoring duplicate call');
    return;
  }

  paymentError.value = null;
  isSubmitting.value = true;
  buttonText.value = t('messages.general.processing');

  try {
    // Step 1: Check Turnstile token if enabled (widget auto-generates token)
    if (isTurnstileEnabled.value && !shouldShowHelcimCard.value) {
      if (!turnstileToken.value) {
        console.error('❌ No Turnstile token - security check not completed');
        throw new Error('Please complete the security verification');
      }
      console.log('✅ Turnstile token present');
    }

    // Validate cart
    if (!cart.value || cart.value.isEmpty) {
      throw new Error(t('messages.shop.cartEmpty'));
    }

    // Validate required billing fields - REQUIRED FOR ALL PAYMENT METHODS
    const missingFields: string[] = [];
    if (!customer.value?.billing?.firstName?.trim()) missingFields.push('First Name');
    if (!customer.value?.billing?.lastName?.trim()) missingFields.push('Last Name');
    if (!customer.value?.billing?.email?.trim()) missingFields.push('Email Address');
    if (!customer.value?.billing?.phone?.trim()) missingFields.push('Phone Number');

    if (missingFields.length > 0) {
      paymentError.value = `Please fill in the following required fields: ${missingFields.join(', ')}`;
      console.error('[payNow] Missing required billing fields:', missingFields);
      throw new Error(paymentError.value);
    }

    // Validate email format
    if (!emailRegex.test(customer.value.billing.email.trim())) {
      paymentError.value = 'Please enter a valid email address.';
      console.error('[payNow] Invalid email format.');
      throw new Error(paymentError.value);
    }

    // CRITICAL: Validate stock BEFORE payment processing to prevent overselling
    console.log('[payNow] Validating stock availability before payment...');
    const lineItemsForValidation =
      cart.value.contents?.nodes?.map((item: any) => ({
        productId: item.product?.node?.databaseId,
        variationId: item.variation?.node?.databaseId || null,
        quantity: item.quantity,
        name: item.product?.node?.name || item.variation?.node?.name,
      })) || [];

    try {
      const stockValidation = (await $fetch('/api/validate-stock', {
        method: 'POST',
        body: {lineItems: lineItemsForValidation},
      })) as {success: boolean; error?: string; warning?: string; outOfStockItems: Array<{name: string; availableQuantity: number | null}>};

      if (!stockValidation.success) {
        const outOfStockNames = stockValidation.outOfStockItems
          .map((item) => {
            if (item.availableQuantity !== null && item.availableQuantity > 0) {
              return `${item.name} (only ${item.availableQuantity} available)`;
            }
            return `${item.name} (out of stock)`;
          })
          .join(', ');

        console.error('[payNow] ❌ Stock validation failed:', stockValidation.outOfStockItems);
        throw new Error(`Some items are no longer available: ${outOfStockNames}. Please update your cart and try again.`);
      }

      if (stockValidation.warning) {
        console.warn('[payNow] Stock validation warning:', stockValidation.warning);
      }

      console.log('[payNow] ✅ Stock validation passed');
    } catch (stockError: any) {
      // If it's our own thrown error (stock issue), re-throw it
      if (stockError.message?.includes('no longer available')) {
        throw stockError;
      }
      // Otherwise log the API error but allow checkout to proceed (fail open)
      console.warn('[payNow] Stock validation API error, proceeding with checkout:', stockError);
    }

    console.log('[payNow] Starting checkout process. Cart items:', cart.value.contents?.nodes?.length);

    // Process payment based on method
    let success = false;
    const paymentMethodId = orderInput.value.paymentMethod?.id || '';

    console.log('[payNow] Processing payment with method:', paymentMethodId);

    if (paymentMethodId === 'cod' && orderInput.value.paymentMethod?.title?.includes('Helcim')) {
      console.log('[payNow] Processing Custom Helcim payment via COD backend');

      if (helcimPaymentComplete.value) {
        success = true;
        console.log('[payNow] Helcim payment already completed');
      } else {
        // Reset modal closed flag at start of payment
        helcimModalClosed.value = false;

        // Refresh cart to get latest stock status from WooCommerce before payment
        console.log('[payNow] Refreshing cart before payment to check for stock changes...');
        try {
          await refreshCart();
          // Re-check if cart is still valid after refresh
          if (!cart.value || cart.value.isEmpty) {
            throw new Error('Your cart is empty. Items may have been removed due to stock changes.');
          }
        } catch (refreshError) {
          console.warn('[payNow] Cart refresh failed, proceeding with cached cart:', refreshError);
        }

        // Trigger Helcim payment process
        if (helcimCardRef.value?.processPayment) {
          console.log('[payNow] Triggering Helcim payment...');
          helcimCardRef.value.processPayment();

          // Wait for payment completion (with timeout)
          success = await new Promise((resolve) => {
            let resolved = false;

            const checkPayment = () => {
              if (resolved) return;

              // Check if user closed modal
              if (helcimModalClosed.value) {
                resolved = true;
                console.log('[payNow] User closed modal - stopping payment check');
                resolve(false);
                return;
              }

              if (helcimPaymentComplete.value) {
                resolved = true;
                resolve(true);
              } else if (paymentError.value) {
                resolved = true;
                resolve(false);
              } else {
                setTimeout(checkPayment, 500);
              }
            };
            checkPayment();

            // Timeout after 2 minutes (user probably closed modal)
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.log('[payNow] Payment timeout - user may have closed modal');
                paymentError.value = 'Payment was not completed. Please try again.';
                resolve(false);
              }
            }, 120000); // 2 minutes
          });

          // If modal was closed, don't treat it as an error
          if (helcimModalClosed.value && !success) {
            console.log('[payNow] Modal closed by user - not throwing error');
            isSubmitting.value = false;
            buttonText.value = t('messages.shop.placeOrder');
            return; // Exit payNow without throwing error
          }
        } else {
          throw new Error('Helcim payment component not ready');
        }
      }
    } else {
      // For other payment methods (like COD), assume success
      success = true;
      console.log('[payNow] Using non-card payment method:', paymentMethodId);
    }

    if (!success) {
      console.log('[payNow] Payment failed:', paymentError.value);
      throw new Error(paymentError.value || 'Payment failed');
    }

    console.log('[payNow] Payment successful, completing order...');

    // Complete checkout only if payment succeeded
    const checkoutResult = await processCheckout(success, turnstileToken.value);
    if (!checkoutResult?.success) {
      console.log('[payNow] Order completion failed:', checkoutResult?.errorMessage);
      paymentError.value = checkoutResult?.errorMessage || 'Order completion failed after payment';
      throw new Error(paymentError.value || 'Order completion failed after payment');
    }

    console.log('[payNow] Checkout completed successfully');
  } catch (error: any) {
    console.error('Checkout error:', error);
    paymentError.value = error.message || t('messages.shop.genericError', 'An error occurred');
    isPaid.value = false;
    buttonText.value = t('messages.shop.placeOrder');

    // Reset Turnstile on error so user can try again
    if (turnstileWidget.value && typeof turnstileWidget.value.reset === 'function') {
      turnstileWidget.value.reset();
      turnstileToken.value = '';
    }
  } finally {
    isSubmitting.value = false;
    if (!paymentError.value) {
      buttonText.value = t('messages.shop.placeOrder');
    }
  }
};

// Check for email validity
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
const checkEmailOnBlur = (email?: string | null): void => {
  if (email) isInvalidEmail.value = !emailRegex.test(email);
};
const checkEmailOnInput = (email?: string | null): void => {
  if (email && isInvalidEmail.value) isInvalidEmail.value = !emailRegex.test(email);
};

// Helcim payment event handlers
const handleHelcimReady = (tokens?: any) => {
  console.log('[Checkout] Helcim payment ready', tokens);
};

const handleHelcimError = (error: any) => {
  console.error('[Checkout] Helcim payment error:', error);
  paymentError.value = error;
};

const handleHelcimSuccess = async (transactionData: any) => {
  console.log('[Checkout] Helcim payment successful:', transactionData);

  // Prevent double processing
  if (helcimPaymentComplete.value) {
    console.log('[Checkout] Helcim payment already processed, ignoring duplicate success event');
    return;
  }

  helcimPaymentComplete.value = true;
  helcimTransactionData.value = transactionData;

  // Add transaction metadata to order
  const actualTransactionId = transactionData?.data?.data?.transactionId || transactionData?.data?.transactionId;
  if (actualTransactionId) {
    orderInput.value.metaData.push({
      key: '_helcim_transaction_id',
      value: actualTransactionId,
    });
    orderInput.value.transactionId = actualTransactionId;
    console.log('[Checkout] Set transaction ID:', actualTransactionId);
  }

  // Check if this is a digital wallet payment (Google Pay, Apple Pay)
  // Digital wallet payments do NOT return a cardToken - refunds must be done in Helcim dashboard
  const digitalWalletType = transactionData?.data?.digitalWalletType || transactionData?.digitalWalletType;
  if (digitalWalletType) {
    console.log('[Checkout] 💳 Digital wallet payment detected:', digitalWalletType);
    orderInput.value.metaData.push({
      key: '_helcim_digital_wallet',
      value: digitalWalletType,
    });
    orderInput.value.metaData.push({
      key: '_refund_note',
      value: `Digital wallet payment (${digitalWalletType}) - Refund via Helcim dashboard`,
    });
  }

  // Extract and store cardToken for refund support
  // The Helcim WooCommerce plugin requires 'helcim-card-token' meta for native refunds
  // NOTE: Digital wallet payments (Google Pay, Apple Pay) do NOT return cardToken
  console.log('[Checkout] Full transactionData for cardToken search:', JSON.stringify(transactionData, null, 2));

  const cardToken =
    transactionData?.cardToken ||
    transactionData?.data?.cardToken ||
    transactionData?.data?.data?.cardToken ||
    transactionData?.card?.cardToken ||
    transactionData?.data?.card?.cardToken ||
    transactionData?.transaction?.cardToken;

  console.log('[Checkout] CardToken extraction result:', cardToken ? `Found: ${cardToken.substring(0, 10)}...` : 'NOT FOUND');

  if (cardToken) {
    helcimCardToken.value = cardToken;
    orderInput.value.cardToken = cardToken; // Store in orderInput for admin order creation
    orderInput.value.metaData.push({
      key: 'helcim-card-token',
      value: cardToken,
    });
    console.log('[Checkout] ✅ Set cardToken for refund support');
  } else if (digitalWalletType) {
    // Digital wallet - no cardToken expected, this is normal
    console.log('[Checkout] ℹ️ No cardToken for digital wallet payment - this is expected');
    console.log('[Checkout] ℹ️ Refunds for', digitalWalletType, 'must be processed in Helcim dashboard');
  } else {
    // Regular card payment without token - this is unexpected
    console.error('[Checkout] ❌ NO cardToken in Helcim response - REFUNDS WILL FAIL!');
    console.error('[Checkout] Available keys in transactionData:', Object.keys(transactionData || {}));
    if (transactionData?.data) {
      console.error('[Checkout] Available keys in transactionData.data:', Object.keys(transactionData.data || {}));
    }
  }

  // Set payment as completed
  isPaid.value = true;
  paymentError.value = null;

  console.log('[Checkout] Helcim payment state updated successfully');

  // Show loading state for order creation
  isCreatingOrder.value = true;
  orderCreationMessage.value = '✅ Payment successful! Creating your order...';

  // Trigger order creation
  console.log('[Checkout] Triggering payNow() after successful Helcim payment to create order');

  try {
    await payNow();
    // Loading state will be cleared on redirect to success page
  } catch (error: any) {
    console.error('[Checkout] Error during order creation after Helcim payment:', error);
    paymentError.value = error.message || 'Order creation failed after successful payment';
    isCreatingOrder.value = false;
    orderCreationMessage.value = '';
  }
};

const handleHelcimFailed = (error: any) => {
  console.error('[Checkout] Helcim payment failed:', error);
  helcimPaymentComplete.value = false;
  isPaid.value = false;
  paymentError.value = typeof error === 'string' ? error : 'Payment failed';
};

const handleHelcimComplete = (result: any) => {
  console.log('[Checkout] Helcim payment completed:', result);

  if (result.success) {
    // Include cardToken in the transactionData if present in result
    const enrichedTransactionData = {
      ...result.transactionData,
      cardToken: result.cardToken || result.transactionData?.cardToken,
    };
    handleHelcimSuccess(enrichedTransactionData);
  } else {
    handleHelcimFailed(result.error);
  }
};

const hasPaymentError = computed(() => paymentError.value && !isSubmitting.value);

// Computed property for Helcim amount that includes tax and is reactive
// Converts USD cart total to CAD using the exchange rate
// CRITICAL: Uses exact conversion (no .99 rounding) for financial accuracy
// The .99 rounding is for display prices only — payment amounts must be exact
const helcimAmount = computed(() => {
  if (!cart.value?.total) return 0;

  console.log(`[DEBUG Checkout] Raw cart values:`, {
    cartTotal: cart.value.total,
    cartRawTotal: cart.value.rawTotal,
    cartSubtotal: cart.value.subtotal,
    cartTotalTax: cart.value.totalTax,
    exchangeRate: exchangeRate.value,
  });

  // Convert USD to CAD using exchange rate — exact conversion for payment processing
  if (exchangeRate.value) {
    const cadNumericString = convertToCAD(cart.value.total, exchangeRate.value, false); // false = exact, no .99 rounding
    if (cadNumericString) {
      const cadAmount = parseFloat(cadNumericString) || 0;
      console.log(`[DEBUG Checkout] Helcim amount (CAD converted, exact):`, {
        originalString: cart.value.total,
        cadNumericString: cadNumericString,
        cadAmount: cadAmount,
      });
      return cadAmount;
    }
  }

  // Fallback: parse the total amount string directly (e.g., "$2.24 CAD" -> 2.24)
  const totalStr = cart.value.total.replace(/[^\d.-]/g, '');
  const totalInDollars = parseFloat(totalStr) || 0;

  console.log(`[DEBUG Checkout] Helcim amount (fallback - no conversion):`, {
    originalString: cart.value.total,
    cleanedString: totalStr,
    parsedDollars: totalInDollars,
  });

  return totalInDollars;
});

// Helper to parse price strings to numbers (USD values)
const parsePrice = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
};

// Helper to convert a price string to CAD numeric value with .99 rounding (for display)
const convertPriceToCAD = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  if (exchangeRate.value) {
    // Use .99 rounding to match displayed product prices
    const cadNumericString = convertToCAD(priceStr, exchangeRate.value, true);
    if (cadNumericString) {
      return parseFloat(cadNumericString) || 0;
    }
  }
  // Fallback to parsing without conversion
  return parsePrice(priceStr);
};

// Helper to convert a price string to CAD numeric value WITHOUT .99 rounding (for Helcim financial amounts)
// CRITICAL: .99 rounding must NOT be used for financial amounts sent to Helcim
// because independent rounding of line items, tax, shipping, discount causes
// the invoice total to mismatch the payment amount, triggering
// "Could not complete CC transaction" errors.
const convertPriceToCADExact = (priceStr: string | null | undefined): number => {
  if (!priceStr) return 0;
  if (exchangeRate.value) {
    const cadNumericString = convertToCAD(priceStr, exchangeRate.value, false); // false = exact, no .99 rounding
    if (cadNumericString) {
      return parseFloat(cadNumericString) || 0;
    }
  }
  // Fallback to parsing without conversion
  return parsePrice(priceStr);
};

// Computed property for Helcim line items - provides order backup in Helcim if WP fails
// Converts USD prices to CAD with EXACT conversion (no .99 rounding) for financial accuracy
// IMPORTANT: Uses subtotal (price WITHOUT tax) - tax is passed separately via taxAmount prop
const helcimLineItems = computed(() => {
  if (!cart.value?.contents?.nodes) return [];

  const items = cart.value.contents.nodes.map((item: any) => {
    const productNode = item.variation?.node || item.product?.node;
    const name = productNode?.name || 'Product';
    const sku = productNode?.sku || '';

    // Use SUBTOTAL (without tax) - tax is passed separately to Helcim
    // Use exact CAD conversion (no .99 rounding) to match payment amount
    const lineSubtotal = convertPriceToCADExact(item.subtotal || item.total);
    const quantity = item.quantity || 1;
    const unitPrice = quantity > 0 ? lineSubtotal / quantity : lineSubtotal;

    return {
      description: name,
      quantity: quantity,
      price: parseFloat(unitPrice.toFixed(2)), // Round to 2 decimal places
      total: parseFloat(lineSubtotal.toFixed(2)), // Required by Helcim API
      ...(sku && {sku: sku}),
    };
  });

  return items;
});

// Computed property for shipping amount - converted to CAD (exact, no .99 rounding)
const helcimShippingAmount = computed(() => {
  if (!cart.value?.shippingTotal) return 0;
  return convertPriceToCADExact(cart.value.shippingTotal);
});

// Computed property for selected shipping method name
// Returns the label of the selected shipping method, or empty string if none
const helcimShippingMethod = computed(() => {
  const chosenMethodId = cart.value?.chosenShippingMethods?.[0];
  if (!chosenMethodId) return '';

  // Find the label from available shipping methods
  const rates = cart.value?.availableShippingMethods?.[0]?.rates || [];
  const selectedRate = rates.find((rate: any) => rate.id === chosenMethodId);
  return selectedRate?.label || chosenMethodId; // Fallback to ID if label not found
});

// Computed property for tax amount - converted to CAD (exact, no .99 rounding)
const helcimTaxAmount = computed(() => {
  if (!cart.value?.totalTax) return 0;
  return convertPriceToCADExact(cart.value.totalTax);
});

// Computed property for discount amount - converted to CAD (exact, no .99 rounding)
const helcimDiscountAmount = computed(() => {
  if (!cart.value?.discountTotal) return 0;
  return convertPriceToCADExact(cart.value.discountTotal);
});

// Computed property for customer info to pass to Helcim
const helcimCustomerInfo = computed(() => {
  if (!customer.value?.billing) return null;

  const billing = customer.value.billing;
  return {
    name: `${billing.firstName || ''} ${billing.lastName || ''}`.trim(),
    email: billing.email || '',
    phone: billing.phone || '',
    billingAddress: {
      address1: billing.address1 || '',
      address2: billing.address2 || '',
      city: billing.city || '',
      state: billing.state || '',
      country: billing.country || 'CA',
      postcode: billing.postcode || '',
    },
  };
});

// Computed to show Helcim card - ALWAYS show since Helcim is our ONLY payment method
const shouldShowHelcimCard = computed(() => {
  // ALWAYS show Helcim card when we have a cart with items
  // This ensures Helcim loads regardless of paymentGateways state
  const hasCart = cart.value && !cart.value.isEmpty;

  // Also check if currently selected method is Helcim (backup check)
  const isCurrentlyHelcim = orderInput.value.paymentMethod?.id === 'cod' && orderInput.value.paymentMethod?.title?.includes('Helcim');

  // Also show if we have a completed Helcim payment (prevents disappearing during cart updates)
  const hasHelcimPayment = helcimPaymentComplete.value || helcimTransactionData.value;

  // Keep showing if user just closed modal (so they can try again)
  const userClosedModal = helcimModalClosed.value && !helcimPaymentComplete.value;

  // ALWAYS show when cart has items - Helcim is the only payment method
  const shouldShow = hasCart || isCurrentlyHelcim || hasHelcimPayment || userClosedModal;

  console.log('[shouldShowHelcimCard] Evaluation:', {
    hasCart,
    isCurrentlyHelcim,
    hasHelcimPayment,
    userClosedModal,
    paymentMethodId: orderInput.value.paymentMethod?.id,
    paymentMethodTitle: orderInput.value.paymentMethod?.title,
    helcimModalClosed: helcimModalClosed.value,
    helcimPaymentComplete: helcimPaymentComplete.value,
    result: shouldShow,
  });

  return shouldShow;
});
useSeoMeta({
  title: t('messages.shop.checkout'),
});
</script>

<template>
  <div class="flex flex-col min-h-[600px] relative">
    <!-- Order Creation Loading Overlay -->
    <Transition name="fade">
      <div v-if="isCreatingOrder" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="backdrop-filter: blur(4px)">
        <div class="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4">
          <div class="flex flex-col items-center text-center">
            <LoadingIcon color="#059669" size="64" class="mb-4" />
            <h3 class="text-2xl font-bold text-gray-800 mb-2">Processing Your Order</h3>
            <p class="text-gray-600 mb-4">{{ orderCreationMessage }}</p>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <Icon name="ion:checkmark-circle" size="20" class="text-green-600" />
              <span>Payment successful</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <LoadingIcon color="#6B7280" size="16" />
              <span>Creating order...</span>
            </div>
            <p class="text-xs text-gray-400 mt-4">Please wait, do not close this page</p>
          </div>
        </div>
      </div>
    </Transition>

    <template v-if="cart && customer">
      <div v-if="cart.isEmpty" class="flex flex-col items-center justify-center flex-1 mb-12">
        <!-- Empty cart content - unchanged -->
        <Icon name="ion:cart-outline" size="156" class="opacity-25 mb-5" />
        <h2 class="text-2xl font-bold mb-2">
          {{ $t('messages.shop.cartEmpty') }}
        </h2>
        <span class="text-gray-400 mb-4">{{ $t('messages.shop.addProductsInYourCart') }}</span>
        <NuxtLink
          to="/products"
          class="flex items-center justify-center gap-3 p-2 px-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark">
          {{ $t('messages.shop.browseOurProducts') }}
        </NuxtLink>
      </div>

      <form v-else class="container flex flex-wrap items-start gap-8 my-16 justify-evenly lg:gap-20" @submit.prevent="payNow">
        <div class="grid w-full max-w-2xl gap-8 checkout-form md:flex-1">
          <!-- Customer details section -->
          <div v-if="!viewer && customer.billing">
            <h2 class="w-full mb-2 text-2xl font-semibold leading-none">Contact Information</h2>
            <p class="mt-1 text-sm text-gray-500">
              Already have an account?
              <a href="/my-account" class="text-primary text-semibold">Log in</a>.
            </p>
            <div class="w-full mt-4">
              <label for="email">{{ $t('messages.billing.email') }} <span class="text-red-500">*</span></label>
              <input
                v-model="customer.billing.email"
                placeholder="johndoe@email.com"
                autocomplete="email"
                type="email"
                name="email"
                :class="{'has-error': isInvalidEmail}"
                @blur="checkEmailOnBlur(customer.billing.email)"
                @input="checkEmailOnInput(customer.billing.email)"
                required />
              <Transition name="scale-y" mode="out-in">
                <div v-if="isInvalidEmail" class="mt-1 text-sm text-red-500">Invalid email address</div>
              </Transition>
            </div>
            <!-- Account creation section -->
            <div v-if="orderInput.createAccount">
              <div class="w-full mt-4">
                <label for="username">{{ $t('messages.account.username') }}</label>
                <input v-model="orderInput.username" placeholder="johndoe" autocomplete="username" type="text" name="username" required />
              </div>
              <div class="w-full my-2" v-if="orderInput.createAccount">
                <label for="password">{{ $t('messages.account.password') }}</label>
                <PasswordInput id="password" class="my-2" v-model="orderInput.password" placeholder="••••••••••" :required="true" />
              </div>
            </div>
            <!-- Disabled create account due to turnstyle issues on checkout -->
            <!-- <div v-if="!viewer" class="flex items-center gap-2 my-2">
              <label for="creat-account">Create an account?</label>
              <input
                id="creat-account"
                v-model="orderInput.createAccount"
                type="checkbox"
                name="creat-account"
              />
            </div> -->
          </div>

          <!-- Billing details section -->
          <div>
            <h2 class="w-full mb-3 text-2xl font-semibold">
              {{ $t('messages.billing.billingDetails') }}
            </h2>
            <BillingDetails v-model="customer.billing" />
          </div>

          <!-- Ship to different address section -->
          <label v-if="cart.availableShippingMethods.length > 0" for="shipToDifferentAddress" class="flex items-center gap-2">
            <span>{{ $t('messages.billing.differentAddress') }}</span>
            <input id="shipToDifferentAddress" v-model="orderInput.shipToDifferentAddress" type="checkbox" name="shipToDifferentAddress" />
          </label>

          <!-- Shipping details section -->
          <Transition name="scale-y" mode="out-in">
            <div v-if="orderInput.shipToDifferentAddress">
              <h2 class="mb-4 text-xl font-semibold">
                {{ $t('messages.general.shippingDetails') }}
              </h2>
              <ShippingDetails v-model="customer.shipping" />
            </div>
          </Transition>

          <!-- Shipping methods section -->
          <div v-if="cart.availableShippingMethods.length">
            <h3 class="mb-4 text-xl font-semibold">
              {{ $t('messages.general.shippingSelect') }}
            </h3>
            <ShippingOptions
              :options="cart?.availableShippingMethods?.[0]?.rates || []"
              :active-option="cart?.chosenShippingMethods?.[0] || ''"
              @shipping-changed="refreshCart" />
          </div>

          <!-- Payment methods section - ALWAYS show since Helcim is required -->
          <div class="mt-2 col-span-full">
            <h2 class="mb-4 text-xl font-semibold">
              {{ $t('messages.billing.paymentOptions') }}
            </h2>
            <PaymentOptions v-model="orderInput.paymentMethod" class="mb-4" :paymentGateways="effectivePaymentGateways" />

            <!-- Other payment methods info -->
            <div
              v-if="orderInput.paymentMethod?.id && !(orderInput.paymentMethod?.id === 'cod' && orderInput.paymentMethod?.title?.includes('Helcim'))"
              class="mt-4">
              <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div class="flex items-center gap-3">
                  <Icon name="ion:information-circle" size="20" class="text-blue-600" />
                  <div>
                    <div class="font-medium text-gray-800">
                      {{ orderInput.paymentMethod.title }}
                    </div>
                    <div v-if="orderInput.paymentMethod.description" class="text-sm text-gray-600 mt-1" v-html="orderInput.paymentMethod.description"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order note section -->
          <div>
            <h2 class="mb-4 text-xl font-semibold">{{ $t('messages.shop.orderNote') }} ({{ $t('messages.general.optional') }})</h2>
            <textarea
              id="order-note"
              v-model="orderInput.customerNote"
              name="order-note"
              class="w-full min-h-[100px]"
              rows="4"
              :placeholder="$t('messages.shop.orderNotePlaceholder')"></textarea>
          </div>
        </div>

        <!-- Order summary section -->
        <OrderSummary>
          <div v-if="hasPaymentError" class="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {{ paymentError }}
          </div>

          <!-- Helcim Card Component in Order Summary -->
          <div v-if="shouldShowHelcimCard" class="mt-4">
            <HelcimCard
              ref="helcimCardRef"
              :amount="helcimAmount"
              currency="CAD"
              :line-items="helcimLineItems"
              :shipping-amount="helcimShippingAmount"
              :shipping-method="helcimShippingMethod"
              :tax-amount="helcimTaxAmount"
              :discount-amount="helcimDiscountAmount"
              :customer-info="helcimCustomerInfo"
              @ready="handleHelcimReady"
              @error="handleHelcimError"
              @payment-success="handleHelcimSuccess"
              @payment-failed="handleHelcimFailed"
              @payment-complete="handleHelcimComplete" />
          </div>

          <!-- Turnstile security verification - invisible widget -->
          <div v-if="isTurnstileEnabled && !shouldShowHelcimCard" class="mt-4 mb-4">
            <ClientOnly>
              <VueTurnstile
                ref="turnstileWidget"
                v-model="turnstileToken"
                :site-key="config.public.turnstile?.siteKey"
                theme="light"
                size="invisible"
                @verify="
                  () => {
                    turnstileError = '';
                  }
                "
                @error="
                  () => {
                    turnstileError = 'Security check failed. Please refresh the page.';
                  }
                " />
            </ClientOnly>
            <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
              {{ turnstileError }}
            </div>
          </div>

          <!-- Standard checkout button - shown for all non-Helcim payments -->
          <button
            v-if="!shouldShowHelcimCard"
            type="submit"
            class="flex items-center justify-center w-full gap-3 p-3 mt-4 font-semibold text-center text-white rounded-lg shadow-md bg-primary hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-400"
            :disabled="isCheckoutDisabled || isSubmitting">
            {{ buttonText }}
            <LoadingIcon v-if="isProcessingOrder || isSubmitting" color="#fff" size="18" />
          </button>
        </OrderSummary>
      </form>
    </template>
    <LoadingIcon v-else class="m-auto" />
  </div>
</template>

<style lang="postcss">
/* Turnstile widget in checkout - visible inline widget */
.turnstile-checkout-widget {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 65px;
  margin: 0 auto;
}

/* Ensure Turnstile iframe is centered and properly sized */
.turnstile-checkout-widget iframe {
  margin: 0 auto;
  display: block;
}

.checkout-form input[type='text'],
.checkout-form input[type='email'],
.checkout-form input[type='tel'],
.checkout-form input[type='password'],
.checkout-form textarea,
.checkout-form select {
  @apply bg-white border rounded-md outline-none border-gray-300 shadow-sm w-full py-2 px-4;
}

.checkout-form input.has-error,
.checkout-form textarea.has-error {
  @apply border-red-500;
}

.checkout-form label {
  @apply my-1.5 text-xs text-gray-600 uppercase;
}

/* Fade transition for loading overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
