<script setup lang="ts">
const { cart } = useCart();
const { stripe } = defineProps(["stripe"]);

const rawCartTotal = computed(() => {
  console.log("cart value", cart.value.rawTotal);
  return (
    cart.value && Math.round(parseFloat(cart.value.rawTotal as string) * 100)
  );
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
  console.log("options", options);
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
