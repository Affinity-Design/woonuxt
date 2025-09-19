<script setup lang="ts">
import { OrderStatusEnum } from '#woo';

const { query, params, name } = useRoute();
const { customer } = useAuth();
const { formatDate, formatPrice } = useHelpers();
const { t } = useI18n();

const order = ref<Order | null>(null);
const fetchDelay = ref<boolean>(query.fetch_delay === 'true');
const delayLength = 1000;
const isLoaded = ref<boolean>(false);
const errorMessage = ref('');
const initialOrderFetchSucceeded = ref(false); // To control delayed refresh

const isGuest = computed(() => !customer.value?.email);
const isSummaryPage = computed<boolean>(() => name === 'order-summary');
const isCheckoutPage = computed<boolean>(() => name === 'order-received');
const orderIsNotCompleted = computed<boolean>(() => order.value?.status !== OrderStatusEnum.COMPLETED);
const hasDiscount = computed<boolean>(() => !!parseFloat(order.value?.rawDiscountTotal || '0'));
const downloadableItems = computed(() => order.value?.downloadableItems?.nodes || []);

onBeforeMount(() => {
  /**
   * This is to close the child PayPal window we open on the checkout page.
   * It will fire off an event that redirects the parent window to the order summary page.
   */
  if (isCheckoutPage.value && (query.cancel_order || query.from_paypal || query.PayerID)) window.close();
});

onMounted(async () => {
  await getOrder();

  // Only set up the delayed refresh if the initial fetch was a full success
  if (initialOrderFetchSucceeded.value && isCheckoutPage.value && fetchDelay.value && orderIsNotCompleted.value) {
    setTimeout(() => {
      // console.log('Delayed order fetch initiated.');
      getOrder();
    }, delayLength);
  }
});

async function getOrder() {
  isLoaded.value = false;
  errorMessage.value = '';
  order.value = null;
  initialOrderFetchSucceeded.value = false; // Reset on each attempt

  try {
    const orderIdFromParams = params.orderId as string;
    if (!orderIdFromParams) {
      throw new Error('Order ID is missing from route parameters.');
    }

    const queryVariables: { id: string; orderKey?: string } = { id: orderIdFromParams };
    // If the user is a guest and an order key is present in the URL, add it to the query variables.
    // This helps in authorizing guest access to order details.
    if (isGuest.value && query.key) {
      queryVariables.orderKey = query.key as string;
    }

    const data = await GqlGetOrder(queryVariables);

    if (data?.order) {
      order.value = data.order;
      initialOrderFetchSucceeded.value = true; // Mark as full successful fetch
      // console.log('Order fetched successfully:', order.value);
    } else {
      let errorDetail = 'Order not found or GraphQL query returned no order data.';
      if (data?.errors?.[0]?.message) {
        errorDetail = data.errors[0].message;
      }
      // console.warn('GraphQL query issue or order not found:', errorDetail, data?.errors);
      throw new Error(errorDetail);
    }
  } catch (err: any) {
    const specificErrorMessage = err?.gqlErrors?.[0]?.message || err.message || 'Could not find order';
    // console.error('Caught error in getOrder:', specificErrorMessage, err);

    // WORKAROUND for successful guest checkout leading to "Not authorized" on immediate fetch
    // This remains specific to the 'order-received' (isCheckoutPage) scenario
    if (
      isGuest.value &&
      isCheckoutPage.value &&
      params.orderId &&
      query.key &&
      (specificErrorMessage.includes('Not authorized to access this order') ||
        specificErrorMessage.includes('Order not found') ||
        specificErrorMessage.includes('Invalid ID'))
    ) {
      // console.log(
      //   'Guest checkout confirmation: Fetch failed with authorization error. Displaying minimal info from URL.',
      // );
      order.value = {
        databaseId: params.orderId as string,
        orderKey: query.key as string,
        status: null,
        lineItems: { nodes: [] },
        paymentMethodTitle: 'N/A',
        date: new Date().toISOString().split('T')[0],
        subtotal: '0',
        totalTax: '0',
        shippingTotal: '0',
        discountTotal: '0',
        rawDiscountTotal: '0',
        total: '0',
      } as unknown as Order;

      errorMessage.value = ''; // Clear the error message for this specific guest checkout success scenario
      initialOrderFetchSucceeded.value = false;
    } else {
      // For other errors, or if not the specific guest checkout scenario (e.g., on order-summary page), set the error message.
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
    <!-- Loading -->
    <LoadingIcon v-if="!isLoaded" class="flex-1" />
    <template v-else>
      <div v-if="order" class="w-full">
        <!-- Summery Page -->
        <template v-if="isSummaryPage">
          <div class="flex items-center gap-4">
            <NuxtLink
              to="/my-account?tab=orders"
              class="inline-flex items-center justify-center p-2 border rounded-md"
              title="Back to orders"
              aria-label="Back to orders">
              <Icon name="ion:chevron-back-outline" />
            </NuxtLink>
            <h1 class="text-xl font-semibold">
              {{ $t('messages.shop.orderSummary') }}
            </h1>
          </div>
        </template>
        <!-- Checkout Page -->
        <template v-else-if="isCheckoutPage">
          <!-- Display order confirmation details here -->
          <div class="my-4 text-center">
            <Icon name="ion:happy-outline" size="64" class="mx-auto mb-4 text-primary-600" />
            <h2 class="text-2xl font-semibold text-green-600 mb-4 text-center">Thank You. Order Received!</h2>
            <!-- <p class="text-gray-700">Order #{{ order.databaseId }}</p> -->
            <p v-if="query.key" class="font-bold text-gray-800">Reference: {{ query.key }}</p>
            <div class="mt-2 text-sm text-gray-600">
              We sent you an email confirmation. <br />We will email you again when your order is shipped or the status has changed. <br />If you have any
              questions please
              <NuxtLink to="/contact" class="text-primary-600 hover:underline"> <b>Contact Us</b>. </NuxtLink>
            </div>
            <div class="mt-6 flex justify-center">
              <NuxtLink class="px-6 py-3 font-bold text-white bg-gray-800 rounded-xl hover:bg-gray-800" to="/"> Return to Shop </NuxtLink>
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
              {{ $t('messages.general.status') }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.general.paymentMethod') }}
            </div>
            <div class="leading-none">{{ order.paymentMethodTitle }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />

          <div class="grid gap-2">
            <div v-for="item in order.lineItems.nodes" :key="item.id" class="flex items-center justify-between gap-8">
              <NuxtLink v-if="item.product?.node" :to="`/product/${item.product.node.slug}`">
                <NuxtImg
                  class="w-16 h-16 rounded-xl"
                  :src="item.variation?.node?.image?.sourceUrl || item.product.node?.image?.sourceUrl || '/images/placeholder.png'"
                  :alt="item.variation?.node?.image?.altText || item.product.node?.image?.altText || 'Product image'"
                  :title="item.variation?.node?.image?.title || item.product.node?.image?.title || 'Product image'"
                  width="64"
                  height="64"
                  loading="lazy" />
              </NuxtLink>
              <div class="flex-1 leading-tight">
                {{ item.variation ? item.variation?.node?.name : item.product?.node.name! }}
              </div>
              <div class="text-sm text-gray-600">Qty. {{ item.quantity }}</div>
              <span class="text-sm font-semibold">{{ formatPrice(item.total!) }}</span>
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
              {{ $t('messages.general.status') }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
            <div v-else class="leading-none">Processing</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t('messages.general.paymentMethod') }}
            </div>
            <div class="leading-none">{{ 'Helcim' }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />

          <div class="grid gap-2">
            <div v-for="item in order.lineItems.nodes" :key="item.id" class="flex items-center justify-between gap-8">
              <NuxtLink v-if="item.product?.node" :to="`/product/${item.product.node.slug}`">
                <NuxtImg
                  class="w-16 h-16 rounded-xl"
                  :src="item.variation?.node?.image?.sourceUrl || item.product.node?.image?.sourceUrl || '/images/placeholder.png'"
                  :alt="item.variation?.node?.image?.altText || item.product.node?.image?.altText || 'Product image'"
                  :title="item.variation?.node?.image?.title || item.product.node?.image?.title || 'Product image'"
                  width="64"
                  height="64"
                  loading="lazy" />
              </NuxtLink>
              <div class="flex-1 leading-tight">
                {{ item.variation ? item.variation?.node?.name : item.product?.node.name! }}
              </div>
              <div class="text-sm text-gray-600">Qty. {{ item.quantity }}</div>
              <span class="text-sm font-semibold">{{ formatPrice(item.total!) }}</span>
            </div>
          </div>
        </template>
        <div v-if="!isGuest">
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
    </template>
  </div>
</template>
