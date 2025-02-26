<script setup lang="ts">
const { cart } = useCart();
const { stripe } = defineProps(["stripe"]);

const rawCartTotal = computed(() => {
  if (!cart.value || !cart.value.rawTotal) return 0; // Safety check
  return Math.round(parseFloat(cart.value.rawTotal) * 100);
});
const emit = defineEmits(["updateElement"]);
let elements = null as any;

console.log(
  "raw",
  cart.value.rawTotal,
  "float",
  parseFloat(cart.value.rawTotal as string),
  "conv",
  Math.floor(rawCartTotal.value),
  "new",
  rawCartTotal.value,
  "type",
  typeof rawCartTotal.value
);

const options = {
  mode: "payment",
  currency: "cad",
  amount: Number(rawCartTotal.value),
  payment_method_types: ["card"],
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
