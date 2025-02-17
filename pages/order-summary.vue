<script setup lang="ts">
import { OrderStatusEnum } from "#woo";

const { query, params, name } = useRoute();
const { customer } = useAuth();
const { formatDate, formatPrice } = useHelpers();
const { t } = useI18n();

const order = ref<Order | null>(null);
const fetchDelay = ref<boolean>(query.fetch_delay === "true");
const delayLength = 2500;
const isLoaded = ref<boolean>(false);
const errorMessage = ref("");

const isGuest = computed(() => !customer.value?.email);
const isSummaryPage = computed<boolean>(() => name === "order-summary");
const isCheckoutPage = computed<boolean>(() => name === "order-received");
const orderIsNotCompleted = computed<boolean>(
  () => order.value?.status !== OrderStatusEnum.COMPLETED
);
const hasDiscount = computed<boolean>(
  () => !!parseFloat(order.value?.rawDiscountTotal || "0")
);
const downloadableItems = computed(
  () => order.value?.downloadableItems?.nodes || []
);

onBeforeMount(() => {
  /**
   * This is to close the child PayPal window we open on the checkout page.
   * It will fire off an event that redirects the parent window to the order summary page.
   */
  if (
    isCheckoutPage.value &&
    (query.cancel_order || query.from_paypal || query.PayerID)
  )
    window.close();
});

onMounted(async () => {
  await getOrder();
  /**
   * WooCommerce sometimes takes a while to update the order status.
   * This is a workaround to fetch the order again after a delay.
   * The length of the delay might need to be adjusted depending on your server.
   */

  if (isCheckoutPage.value && fetchDelay.value && orderIsNotCompleted.value) {
    setTimeout(() => {
      getOrder();
    }, delayLength);
  }
});

async function getOrder() {
  isLoaded.value = false;
  try {
    const data = await GqlGetOrder({ id: params.orderId as string });
    console.log("Order response:", data); // Debug log

    if (!data) {
      throw new Error("No data received from API");
    }

    if (!data.order) {
      throw new Error("Order not found");
    }

    order.value = data.order;
  } catch (err: any) {
    console.error("Order error:", err); // Debug log
    errorMessage.value =
      err?.gqlErrors?.[0]?.message || err.message || "Could not find order";
    order.value = null;
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
    return isSummaryPage.value
      ? t("messages.shop.orderSummary")
      : t("messages.shop.orderReceived");
  },
});
</script>

<template>
  <div
    class="w-full min-h-[600px] flex items-center p-4 text-gray-800 md:bg-white md:rounded-xl md:mx-auto md:shadow-lg md:my-24 md:mt-8 md:max-w-3xl md:p-16 flex-col"
  >
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
              aria-label="Back to orders"
            >
              <Icon name="ion:chevron-back-outline" />
            </NuxtLink>
            <h1 class="text-xl font-semibold">
              {{ $t("messages.shop.orderSummary") }}
            </h1>
          </div>
        </template>
        <!-- Checkout Page -->
        <template v-else-if="isCheckoutPage">
          <div class="flex items-center justify-between w-full mb-2">
            <h1 class="text-xl font-semibold">
              {{ $t("messages.shop.orderReceived") }}
            </h1>
            <button
              v-if="orderIsNotCompleted"
              type="button"
              class="inline-flex items-center justify-center p-2 bg-white border rounded-md"
              title="Refresh order"
              aria-label="Refresh order"
              @click="refreshOrder"
            >
              <Icon name="ion:refresh-outline" />
            </button>
          </div>
          <p>{{ $t("messages.shop.orderThanks") }}</p>
        </template>
        <hr class="my-8" />
      </div>
      <!-- LoggedIn User -->
      <div v-if="order && !isGuest" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.shop.order") }}
            </div>
            <div class="leading-none">#{{ order.databaseId! }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.date") }}
            </div>
            <div class="leading-none">{{ formatDate(order.date) }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.status") }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.paymentMethod") }}
            </div>
            <div class="leading-none">{{ order.paymentMethodTitle }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />

          <div class="grid gap-2">
            <div
              v-for="item in order.lineItems.nodes"
              :key="item.id"
              class="flex items-center justify-between gap-8"
            >
              <NuxtLink
                v-if="item.product?.node"
                :to="`/product/${item.product.node.slug}`"
              >
                <NuxtImg
                  class="w-16 h-16 rounded-xl"
                  :src="
                    item.variation?.node?.image?.sourceUrl ||
                    item.product.node?.image?.sourceUrl ||
                    '/images/placeholder.png'
                  "
                  :alt="
                    item.variation?.node?.image?.altText ||
                    item.product.node?.image?.altText ||
                    'Product image'
                  "
                  :title="
                    item.variation?.node?.image?.title ||
                    item.product.node?.image?.title ||
                    'Product image'
                  "
                  width="64"
                  height="64"
                  loading="lazy"
                />
              </NuxtLink>
              <div class="flex-1 leading-tight">
                {{
                  item.variation
                    ? item.variation?.node?.name
                    : item.product?.node.name!
                }}
              </div>
              <div class="text-sm text-gray-600">Qty. {{ item.quantity }}</div>
              <span class="text-sm font-semibold">{{
                formatPrice(item.total!)
              }}</span>
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
            <span>{{ $t("messages.shop.subtotal") }}</span>
            <span>{{ order.subtotal }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t("messages.general.tax") }}</span>
            <span>{{ order.totalTax }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t("messages.general.shipping") }}</span>
            <span>{{ order.shippingTotal }}</span>
          </div>
          <div v-if="hasDiscount" class="flex justify-between text-primary">
            <span>{{ $t("messages.shop.discount") }}</span>
            <span>- {{ order.discountTotal }}</span>
          </div>
          <hr class="my-8" />
          <div class="flex justify-between">
            <span class>{{ $t("messages.shop.total") }}</span>
            <span class="font-semibold">{{ order.total }}</span>
          </div>
        </div>
      </div>
      <!-- If Guest -->
      <div v-if="order && isGuest" class="flex-1 w-full">
        <div class="flex items-start justify-between">
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.shop.order") }}
            </div>
            <div class="leading-none">#{{ order.databaseId! }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.date") }}
            </div>
            <div class="leading-none">{{ formatDate(order.date) }}</div>
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.status") }}
            </div>
            <OrderStatusLabel v-if="order.status" :order="order" />
          </div>
          <div class="w-[21%]">
            <div class="mb-2 text-xs text-gray-400 uppercase">
              {{ $t("messages.general.paymentMethod") }}
            </div>
            <div class="leading-none">{{ order.paymentMethodTitle }}</div>
          </div>
        </div>

        <template v-if="order.lineItems">
          <hr class="my-8" />

          <div class="grid gap-2">
            <div
              v-for="item in order.lineItems.nodes"
              :key="item.id"
              class="flex items-center justify-between gap-8"
            >
              <NuxtLink
                v-if="item.product?.node"
                :to="`/product/${item.product.node.slug}`"
              >
                <NuxtImg
                  class="w-16 h-16 rounded-xl"
                  :src="
                    item.variation?.node?.image?.sourceUrl ||
                    item.product.node?.image?.sourceUrl ||
                    '/images/placeholder.png'
                  "
                  :alt="
                    item.variation?.node?.image?.altText ||
                    item.product.node?.image?.altText ||
                    'Product image'
                  "
                  :title="
                    item.variation?.node?.image?.title ||
                    item.product.node?.image?.title ||
                    'Product image'
                  "
                  width="64"
                  height="64"
                  loading="lazy"
                />
              </NuxtLink>
              <div class="flex-1 leading-tight">
                {{
                  item.variation
                    ? item.variation?.node?.name
                    : item.product?.node.name!
                }}
              </div>
              <div class="text-sm text-gray-600">Qty. {{ item.quantity }}</div>
              <span class="text-sm font-semibold">{{
                formatPrice(item.total!)
              }}</span>
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
            <span>{{ $t("messages.shop.subtotal") }}</span>
            <span>{{ order.subtotal }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t("messages.general.tax") }}</span>
            <span>{{ order.totalTax }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ $t("messages.general.shipping") }}</span>
            <span>{{ order.shippingTotal }}</span>
          </div>
          <div v-if="hasDiscount" class="flex justify-between text-primary">
            <span>{{ $t("messages.shop.discount") }}</span>
            <span>- {{ order.discountTotal }}</span>
          </div>
          <hr class="my-8" />
          <div class="flex justify-between">
            <span class>{{ $t("messages.shop.total") }}</span>
            <span class="font-semibold">{{ order.total }}</span>
          </div>
        </div>
      </div>
      <!-- If error -->
      <div
        v-else-if="errorMessage"
        class="flex flex-col items-center justify-center flex-1 w-full gap-4 text-center"
      >
        <!-- Confirm Order -->
        <template v-if="errorMessage === 'Not authorized to access this order'">
          <Icon name="ion:happy-outline" size="96" class="text-primary-600" />
          <h1 class="text-4xl font-semibold text-green-600 mb-4">
            Thank You. Order Received!
          </h1>

          <!-- Added Order Key Reference -->
          <div class="mt-2 mb-4 text-center">
            <p class="text-gray-700">Order #{{ params.orderId }}</p>
            <p class="font-bold text-gray-800">Reference: {{ query.key }}</p>
          </div>

          <div class="text-sm text-gray-600">
            We sent you an email confirmation. <br />We will email you again
            when your order is shipped or the status has changed. <br />If you
            have any questions please
            <NuxtLink to="/contact-us" class="text-primary-600 hover:underline">
              <b>Contact Us</b>.
            </NuxtLink>
          </div>

          <div class="mt-2 flex justify-center">
            <NuxtLink
              class="px-6 py-3 font-bold text-white bg-gray-800 rounded-xl hover:bg-gray-800"
              to="/"
            >
              Return to Shop
            </NuxtLink>
          </div>
        </template>
        <!-- Catch all -->
        <template v-else>
          <Icon name="ion:sad-outline" size="96" class="text-gray-700" />
          <h1 class="text-xl font-semibold">Error</h1>
          <div class="text-sm text-red-500" v-html="errorMessage" />
        </template>
      </div>
    </template>
  </div>
</template>
