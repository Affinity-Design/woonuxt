<script setup>
const {cart, isUpdatingCart} = useCart();
const props = defineProps({
  disabled: {type: Boolean, default: false},
});
const {t} = useI18n();

// Use the global isUpdatingCart state from useCart
// This properly resets on both success AND error
const addToCartButtonText = computed(() => (isUpdatingCart.value ? t('messages.shop.adding') : t('messages.shop.addToCart')));
</script>

<template>
  <button
    type="submit"
    class="rounded-lg flex font-bold bg-gray-800 text-white text-center min-w-[150px] p-2.5 gap-4 items-center justify-center focus:outline-none"
    :class="{disabled: disabled}"
    :disabled="disabled || isUpdatingCart">
    <span>{{ addToCartButtonText }}</span>
    <LoadingIcon v-if="isUpdatingCart" stroke="4" size="12" color="#fff" />
  </button>
</template>

<style lang="postcss" scoped>
button {
  outline: none !important;
  transition: all 150ms ease-in;
}

button.disabled {
  @apply cursor-not-allowed bg-gray-400;
}
</style>
