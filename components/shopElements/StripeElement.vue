<script setup lang="ts">
const { cart } = useCart();
const { stripe } = defineProps(["stripe"]);

const rawCartTotal = computed(() => {
  if (!cart.value?.rawTotal) return 0;
  return Math.round(parseFloat(cart.value.rawTotal) * 100);
});
const emit = defineEmits(["updateElement"]);
let elements = null as any;

const options = {
  mode: "payment",
  currency: "cad",
  amount: rawCartTotal.value,
  // paymentMethodCreation: 'manual',
};

const createStripeElements = async () => {
  elements = stripe.elements(options);
  const paymentElement = elements.create("card", { hidePostalCode: true });
  paymentElement.mount("#card-element");
  emit("updateElement", elements);
};

onMounted(() => {
  createStripeElements();
});
</script>

<template>
  <div id="card-element">
    <!-- Elements will create form elements here -->
  </div>
</template>
