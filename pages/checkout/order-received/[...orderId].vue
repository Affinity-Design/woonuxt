<script setup lang="ts">
import {OrderStatusEnum} from '#woo';

const route = useRoute();
const {query, params} = route;
const {customer} = useAuth();
const {formatDate, formatPrice} = useHelpers();
const {clearAttemptId} = useCheckoutAttempt();
const {t} = useI18n();

const order = ref<Order | null>(null);
const fetchDelay = ref<boolean>(query.fetch_delay === 'true');
const delayLength = 1000;
const isLoaded = ref<boolean>(false);
const errorMessage = ref('');
const initialOrderFetchSucceeded = ref(false);
// True when the order fetch failed and we rendered the soft placeholder receipt instead.
// Silent background retries then try to hydrate the real order without flashing the UI.
const usedSoftFallback = ref(false);
let softRetryTimer: ReturnType<typeof setTimeout> | null = null;

const isGuest = computed(() => !customer.value?.email);
const isSummaryPage = computed<boolean>(() => route.path.includes('/order-summary'));
const isCheckoutPage = computed<boolean>(() => route.path.includes('/order-received'));
const orderIsNotCompleted = computed<boolean>(() => order.value?.status !== OrderStatusEnum.COMPLETED);
const hasDiscount = computed<boolean>(() => !!parseFloat(order.value?.rawDiscountTotal || '0'));
const downloadableItems = computed(() => order.value?.downloadableItems?.nodes || []);
const orderNumberFromQuery = computed(() => {
  if (Array.isArray(query.number)) return query.number[0] || '';
  return typeof query.number === 'string' ? query.number : '';
});
const displayOrderNumber = computed(() => order.value?.orderNumber || orderNumberFromQuery.value || order.value?.databaseId || '');

// Helper to determine payment method display
const getPaymentMethodDisplay = computed(() => {
  if (!order.value) return 'N/A';

  // Check if this was a Helcim payment via metadata or payment method
  // Support both 'helcim' (legacy) and 'helcimjs' (current - matches WooCommerce plugin)
  const isHelcimPayment =
    order.value.paymentMethod === 'helcim' ||
    order.value.paymentMethod === 'helcimjs' ||
    order.value.paymentMethodTitle?.includes('Helcim') ||
    order.value.metaData?.some((meta: any) => meta.key === '_payment_method' && (meta.value === 'helcim' || meta.value === 'helcimjs'));

  if (isHelcimPayment) {
    return 'Helcim Credit Card';
  }

  return order.value.paymentMethodTitle || order.value.paymentMethod || 'N/A';
});

onBeforeMount(() => {
  if (isCheckoutPage.value && (query.cancel_order || query.from_paypal || query.PayerID)) window.close();
});

onMounted(async () => {
  // The receipt page OWNS clearing the checkout-attempt id (2026-08-03 triple-charge incident).
  // Clearing anywhere earlier (e.g. right before the redirect) disarms the duplicate-charge
  // guard for exactly the failure it exists for: a redirect that never lands. Reaching a
  // rendered receipt is the one proof the purchase is finished.
  if (isCheckoutPage.value && query.key) {
    clearAttemptId();
  }

  await getOrder();

  if (initialOrderFetchSucceeded.value && isCheckoutPage.value && fetchDelay.value && orderIsNotCompleted.value) {
    setTimeout(() => {
      getOrder();
    }, delayLength);
  }
});

onUnmounted(() => {
  if (softRetryTimer) clearTimeout(softRetryTimer);
});

async function fetchOrderFromApi(): Promise<Order> {
  const orderIdFromParams = params.orderId as string;
  if (!orderIdFromParams) {
    throw new Error('Order ID is missing from route parameters.');
  }

  const queryVariables: {id: string; orderKey?: string} = {
    id: orderIdFromParams,
  };
  if (isGuest.value && query.key) {
    queryVariables.orderKey = query.key as string;
  }

  const data = await GqlGetOrder(queryVariables);

  if (data?.order) return data.order as Order;

  let errorDetail = 'Order not found or GraphQL query returned no order data.';
  if (data?.errors?.[0]?.message) {
    errorDetail = data.errors[0].message;
  }
  throw new Error(errorDetail);
}

// Retry the fetch quietly after the soft placeholder rendered — hydrate the real order details
// without resetting/flashing the page. Gives up silently; the placeholder is already a valid
// confirmation (the customer only reaches this page with an order id + key after the server
// confirmed the order exists).
function scheduleSilentOrderRetry(attempt = 1) {
  const maxAttempts = 3;
  if (attempt > maxAttempts) return;
  if (softRetryTimer) clearTimeout(softRetryTimer);
  softRetryTimer = setTimeout(async () => {
    try {
      const fresh = await fetchOrderFromApi();
      order.value = fresh;
      initialOrderFetchSucceeded.value = true;
      usedSoftFallback.value = false;
      console.log('[OrderReceived] Silent retry hydrated the real order details');
    } catch {
      scheduleSilentOrderRetry(attempt + 1);
    }
  }, 4000 * attempt);
}

async function getOrder() {
  isLoaded.value = false;
  errorMessage.value = '';
  order.value = null;
  initialOrderFetchSucceeded.value = false;

  try {
    order.value = await fetchOrderFromApi();
    initialOrderFetchSucceeded.value = true;
    usedSoftFallback.value = false;
  } catch (err: any) {
    const specificErrorMessage = err?.gqlErrors?.[0]?.message || err.message || 'Could not find order';

    // A customer arriving here from checkout with an order id + key has ALREADY paid and has an
    // order — this page is their receipt. Rendering a scary error ("Order Not Found") here for a
    // transient fetch failure is what sent a paid customer back to re-purchase on 2026-08-03
    // (orders 500048481/84/87). For ANY fetch failure on a checkout arrival, show the soft
    // confirmation (order number from the redirect) and hydrate the details in the background.
    if (isCheckoutPage.value && params.orderId && query.key) {
      order.value = {
        databaseId: params.orderId as string,
        orderNumber: orderNumberFromQuery.value,
        orderKey: query.key as string,
        status: null,
        lineItems: {nodes: []},
        paymentMethodTitle: 'N/A',
        date: new Date().toISOString().split('T')[0],
        subtotal: '0',
        totalTax: '0',
        shippingTotal: '0',
        discountTotal: '0',
        rawDiscountTotal: '0',
        total: '0',
      } as unknown as Order;

      errorMessage.value = '';
      initialOrderFetchSucceeded.value = false;
      usedSoftFallback.value = true;
      console.warn('[OrderReceived] Order fetch failed on checkout arrival — showing soft confirmation, retrying quietly:', specificErrorMessage);
      scheduleSilentOrderRetry();
    } else {
      errorMessage.value = specificErrorMessage;
      order.value = null;
      initialOrderFetchSucceeded.value = false;
    }
  } finally {
    isLoaded.value = true;
  }
}

const refreshOrder = async () => {
  isLoaded.value = false;
  await getOrder();
};

useSeoMeta({
  title() {
    return isSummaryPage.value ? t('messages.shop.orderSummary') : t('messages.shop.orderReceived');
  },
});
</script>

<template>
  <div
    class="w-full min-h-[600px] flex items-center p-4 text-gray-800 md:bg-white md:rounded-xl md:mx-auto md:shadow-lg md:my-24 md:mt-8 md:max-w-3xl md:p-16 flex-col">
    <div v-if="!isLoaded" class="flex flex-col items-center justify-center flex-1 w-full min-h-[300px]">
      <LoadingIcon size="60" stroke="4" />
      <p class="mt-6 text-gray-500 font-medium animate-pulse">Loading order details...</p>
    </div>
    <template v-else>
      <div v-if="order" class="w-full">
        <!-- Checkout Page -->
        <template v-if="isCheckoutPage">
          <div class="my-4 text-center">
            <Icon name="ion:happy-outline" size="64" class="mx-auto mb-4 text-primary-600" />
            <h2 class="text-2xl font-semibold text-green-600 mb-4 text-center">Thank You. Order Received!</h2>
            <p class="text-gray-700">Order #{{ displayOrderNumber }}</p>
            <p v-if="query.key" class="font-bold text-gray-800">Reference: {{ query.key }}</p>
            <div class="mt-2 text-sm text-gray-600">
              <p>We sent you an email confirmation.</p>
              <p>We will email you again when your order is shipped or the status has changed.</p>
              <p v-if="usedSoftFallback" class="mt-2">Your payment was received — the full receipt details are in your confirmation email.</p>
              <p v-if="customer?.email">
                If you have any questions please
                <NuxtLink to="/contact" class="text-primary underline">Contact Us</NuxtLink>.
              </p>
            </div>
            <div class="mt-6 flex justify-center">
              <NuxtLink to="/products" class="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg">Return to Shop</NuxtLink>
            </div>
          </div>
        </template>
        <hr class="my-8" />
      </div>

      <!-- LoggedIn User (hidden while the soft placeholder is up — no real totals to show) -->
      <div v-if="order && !isGuest && !usedSoftFallback" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="text-center mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.order') }}
            </div>
            <div class="leading-none">#{{ displayOrderNumber }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.general.date') }}
            </div>
            <div class="leading-none">{{ formatDate(order.date) }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.status') }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.paymentMethod') }}
            </div>
            <div class="leading-none">{{ getPaymentMethodDisplay }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />
          <div class="grid gap-2">
            <div v-for="item in order.lineItems.nodes" :key="item.id" class="flex items-center justify-between gap-8">
              <div class="leading-none text-sm">
                <div>{{ item.product?.node?.name || 'Product' }}</div>
                <div class="text-xs text-gray-500">Qty: {{ item.quantity }}</div>
              </div>
              <div class="leading-none">
                {{ formatPrice(item.total || '0') }}
              </div>
            </div>
          </div>
        </template>

        <hr class="my-8" />

        <div v-if="downloadableItems.length && !orderIsNotCompleted">
          <DownloadableItems :downloadableItems="downloadableItems" />
          <hr class="my-8" />
        </div>

        <div>
          <div class="flex justify-between">
            <span>{{ $t('messages.shop.subtotal') }}</span>
            <span>{{ formatPrice(order.subtotal || '0') }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t('messages.general.tax') }}</span>
            <span>{{ formatPrice(order.totalTax || '0') }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t('messages.general.shipping') }}</span>
            <span>{{ formatPrice(order.shippingTotal || '0') }}</span>
          </div>
          <div v-if="hasDiscount" class="flex justify-between text-primary">
            <span>{{ $t('messages.shop.discount') }}</span>
            <span>- {{ formatPrice(order.discountTotal || '0') }}</span>
          </div>
          <hr class="my-8" />
          <div class="flex justify-between">
            <span class>{{ $t('messages.shop.total') }}</span>
            <span class="font-semibold">{{ formatPrice(order.total || '0') }}</span>
          </div>
        </div>
      </div>

      <!-- If Guest (hidden while the soft placeholder is up — no real totals to show) -->
      <div v-if="order && isGuest && !usedSoftFallback" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.order') }}
            </div>
            <div class="leading-none">#{{ displayOrderNumber }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.general.date') }}
            </div>
            <div class="leading-none">{{ formatDate(order.date) }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.status') }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
            <div v-else class="leading-none">Processing</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.paymentMethod') }}
            </div>
            <!-- Fixed: Use computed payment method display instead of hardcoded "Stripe" -->
            <div class="leading-none">{{ getPaymentMethodDisplay }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />
          <div class="grid gap-2">
            <div v-for="item in order.lineItems.nodes" :key="item.id" class="flex items-center justify-between gap-8">
              <div class="leading-none text-sm">
                <div>{{ item.product?.node?.name || 'Product' }}</div>
                <div class="text-xs text-gray-500">Qty: {{ item.quantity }}</div>
              </div>
              <div class="leading-none">
                {{ formatPrice(item.total || '0') }}
              </div>
            </div>
          </div>
        </template>

        <div>
          <hr class="my-8" />
          <div v-if="downloadableItems.length && !orderIsNotCompleted">
            <DownloadableItems :downloadableItems="downloadableItems" />
            <hr class="my-8" />
          </div>
          <div>
            <div class="flex justify-between">
              <span>{{ $t('messages.shop.subtotal') }}</span>
              <span>{{ formatPrice(order.subtotal || '0') }}</span>
            </div>
            <div class="flex justify-between">
              <span>{{ $t('messages.general.tax') }}</span>
              <span>{{ formatPrice(order.totalTax || '0') }}</span>
            </div>
            <div class="flex justify-between">
              <span>{{ $t('messages.general.shipping') }}</span>
              <span>{{ formatPrice(order.shippingTotal || '0') }}</span>
            </div>
            <div v-if="hasDiscount" class="flex justify-between text-primary">
              <span>{{ $t('messages.shop.discount') }}</span>
              <span>- {{ formatPrice(order.discountTotal || '0') }}</span>
            </div>
            <hr class="my-8" />
            <div class="flex justify-between">
              <span class>{{ $t('messages.shop.total') }}</span>
              <span class="font-semibold">{{ formatPrice(order.total || '0') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="errorMessage && !order" class="flex flex-col items-center justify-center flex-1">
        <Icon name="ion:alert-circle-outline" size="64" class="mx-auto mb-4 text-red-500" />
        <h2 class="text-xl font-semibold text-red-600 mb-2">Order Not Found</h2>
        <p class="text-gray-600 text-center mb-4">{{ errorMessage }}</p>
        <button @click="refreshOrder" class="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg">Try Again</button>
      </div>
    </template>
  </div>
</template>
