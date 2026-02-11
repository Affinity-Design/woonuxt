<script setup lang="ts">
const {updateItemQuantity, isUpdatingCart, cart} = useCart();
const {debounce} = useHelpers();
const toast = useToast();

const {item} = defineProps({item: {type: Object, required: true}});

const productType = computed(() => (item.variation ? item.variation?.node : item.product?.node));
const quantity = ref(item.quantity);

// Get the product ID for stock checking
const productId = computed(() => {
  if (item.variation?.node?.databaseId) {
    return item.variation.node.databaseId;
  }
  return item.product?.node?.databaseId;
});

// Fetch actual stock quantity from server
const stockQuantity = ref<number | null>(null);
const isLoadingStock = ref(false);

const fetchStockStatus = async () => {
  if (!productId.value) return;

  isLoadingStock.value = true;
  try {
    const response = await $fetch('/api/stock-status', {
      method: 'GET',
      params: {
        productId: productId.value,
        isVariation: !!item.variation,
      },
    });

    if (response && typeof response.stockQuantity === 'number') {
      stockQuantity.value = response.stockQuantity;
    } else if (response && response.stockStatus === 'IN_STOCK' && !response.stockQuantity) {
      // Unlimited stock
      stockQuantity.value = null;
    }
  } catch (error) {
    console.error('[QuantityInput] Failed to fetch stock:', error);
    // Fall back to product data if available
    stockQuantity.value = productType.value?.stockQuantity ?? null;
  } finally {
    isLoadingStock.value = false;
  }
};

// Fetch stock on mount
onMounted(() => {
  fetchStockStatus();
});

// Check if we've reached max stock
const hasNoMoreStock = computed(() => {
  // If we have a stock quantity from the API or product data
  const maxStock = stockQuantity.value ?? productType.value?.stockQuantity;
  if (maxStock !== null && maxStock !== undefined) {
    return maxStock <= quantity.value;
  }
  return false;
});

const incrementQuantity = () => {
  const maxStock = stockQuantity.value ?? productType.value?.stockQuantity;

  // Check stock before incrementing
  if (maxStock !== null && maxStock !== undefined && quantity.value >= maxStock) {
    toast.error(`Sorry, only ${maxStock} available in stock.`);
    return;
  }

  quantity.value++;
};

const decrementQuantity = () => quantity.value--;

watch(
  quantity,
  debounce(() => {
    if (quantity.value !== '') {
      updateItemQuantity(item.key, quantity.value);
    }
  }, 250),
);

const onFocusOut = () => {
  if (quantity.value === '') {
    // If the quantity is empty, set it to the cart item quantity
    const cartItem = cart.value?.contents?.nodes?.find((node: any) => node.key === item.key);
    if (cartItem) {
      quantity.value = cartItem.quantity;
    }
  }
};
</script>

<template>
  <div class="flex rounded bg-white text-sm leading-none shadow-sm shadow-gray-200 isolate">
    <button
      title="Decrease Quantity"
      aria-label="Decrease Quantity"
      @click="decrementQuantity"
      type="button"
      class="focus:outline-none border-r w-6 h-6 border rounded-l border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed"
      :disabled="isUpdatingCart || quantity <= 0">
      <Icon name="ion:remove" size="14" />
    </button>
    <input
      v-model.number="quantity"
      type="number"
      min="0"
      :max="stockQuantity ?? productType?.stockQuantity"
      aria-label="Quantity"
      @focusout="onFocusOut"
      class="flex items-center justify-center w-8 px-2 text-right text-xs focus:outline-none border-y border-gray-300" />
    <button
      title="Increase Quantity"
      aria-label="Increase Quantity"
      @click="incrementQuantity"
      type="button"
      class="focus:outline-none border-l w-6 h-6 border rounded-r hover:bg-gray-50 border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-100"
      :disabled="isUpdatingCart || hasNoMoreStock || isLoadingStock">
      <Icon name="ion:add" size="14" />
    </button>
  </div>
</template>

<style scoped lang="postcss">
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
