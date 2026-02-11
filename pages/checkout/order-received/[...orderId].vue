<script setup lang="ts">
import {OrderStatusEnum} from '#woo';

const {query, params, name} = useRoute();
const {customer} = useAuth();
const {formatDate, formatPrice} = useHelpers();
const {t} = useI18n();

const order = ref<Order | null>(null);
const fetchDelay = ref<boolean>(query.fetch_delay === 'true');
const delayLength = 1000;
const isLoaded = ref<boolean>(false);
const errorMessage = ref('');
const initialOrderFetchSucceeded = ref(false);

const isGuest = computed(() => !customer.value?.email);
const isSummaryPage = computed<boolean>(() => name === 'order-summary');
const isCheckoutPage = computed<boolean>(() => name === 'order-received');
const orderIsNotCompleted = computed<boolean>(() => order.value?.status !== OrderStatusEnum.COMPLETED);
const hasDiscount = computed<boolean>(() => !!parseFloat(order.value?.rawDiscountTotal || '0'));
const downloadableItems = computed(() => order.value?.downloadableItems?.nodes || []);

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
  await getOrder();

  if (initialOrderFetchSucceeded.value && isCheckoutPage.value && fetchDelay.value && orderIsNotCompleted.value) {
    setTimeout(() => {
      getOrder();
    }, delayLength);
  }
});

async function getOrder() {
  isLoaded.value = false;
  errorMessage.value = '';
  order.value = null;
  initialOrderFetchSucceeded.value = false;

  try {
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

    if (data?.order) {
      order.value = data.order;
      initialOrderFetchSucceeded.value = true;
    } else {
      let errorDetail = 'Order not found or GraphQL query returned no order data.';
      if (data?.errors?.[0]?.message) {
        errorDetail = data.errors[0].message;
      }
      throw new Error(errorDetail);
    }
  } catch (err: any) {
    const specificErrorMessage = err?.gqlErrors?.[0]?.message || err.message || 'Could not find order';

    if (
      isGuest.value &&
      isCheckoutPage.value &&
      params.orderId &&
      query.key &&
      (specificErrorMessage.includes('Not authorized to access this order') ||
        specificErrorMessage.includes('Order not found') ||
        specificErrorMessage.includes('Invalid ID'))
    ) {
      order.value = {
        databaseId: params.orderId as string,
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
            <p class="text-gray-700">Order #{{ order.databaseId }}</p>
            <p v-if="query.key" class="font-bold text-gray-800">Reference: {{ query.key }}</p>
            <div class="mt-2 text-sm text-gray-600">
              <p>We sent you an email confirmation.</p>
              <p>We will email you again when your order is shipped or the status has changed.</p>
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

      <!-- LoggedIn User -->
      <div v-if="order && !isGuest" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="text-center mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.order') }}
            </div>
            <div class="leading-none">#{{ order.databaseId! }}</div>
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

      <!-- If Guest -->
      <div v-if="order && isGuest" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.shop.order') }}
            </div>
            <div class="leading-none">#{{ order.databaseId! }}</div>
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
