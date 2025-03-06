<script setup lang="ts">
const props = defineProps<{
  modelValue: string | object;
  paymentGateways: PaymentGateways;
}>();

const paymentMethod = toRef(props, "modelValue");
const activePaymentMethod = computed<PaymentGateway>(
  () => paymentMethod.value as PaymentGateway
);
const emits = defineEmits(["update:modelValue"]);

// List of payment gateways to exclude
const excludedGateways = ["helcimjs", "ppcp"];

// Filter function to exclude unwanted payment gateways
const filterPaymentGateways = (gateways) => {
  return gateways.filter((gateway) => !excludedGateways.includes(gateway.id));
};

const updatePaymentMethod = (value: any) => {
  emits("update:modelValue", value);
};

onMounted(() => {
  // Emit first valid payment method
  if (props.paymentGateways?.nodes.length) {
    const filteredGateways = filterPaymentGateways(props.paymentGateways.nodes);

    if (filteredGateways.length) {
      // Use the first available gateway after filtering
      updatePaymentMethod(filteredGateways[0]);
    } else {
      // Fallback to stripe if no gateways remain after filtering
      updatePaymentMethod("fkwcs_stripe");
    }
  }
});
</script>

<template>
  <div class="flex gap-4 leading-tight flex-wrap">
    <div
      v-for="gateway in filterPaymentGateways(paymentGateways?.nodes || [])"
      :key="gateway.id"
      class="option"
      :class="{ 'active-option': gateway.id === activePaymentMethod.id }"
      @click="updatePaymentMethod(gateway)"
      :title="gateway?.description || gateway?.title || 'Payment Method'"
    >
      <icon
        v-if="gateway.id === 'fkwcs_stripe'"
        name="ion:card-outline"
        size="20"
      />
      <icon
        v-else-if="gateway.id === 'paypal'"
        name="ion:logo-paypal"
        size="20"
      />
      <icon v-else name="ion:cash-outline" size="20" />
      <span class="whitespace-nowrap" v-html="gateway.title" />
      <icon
        name="ion:checkmark-circle"
        size="20"
        class="ml-auto text-primary checkmark opacity-0"
      />
    </div>
    <div v-if="activePaymentMethod.description" class="prose block w-full">
      <p
        class="text-sm text-gray-500"
        v-html="activePaymentMethod.description"
      />
    </div>
    <!-- overdie -->
    <!-- <div
      class="option"
      :class="{ 'active-option': `fkwcs_stripe` === activePaymentMethod.id }"
      @click="updatePaymentMethod(`fkwcs_stripe`)"
      :title="'Payment Method'"
    >
      <span class="whitespace-nowrap" v-html="`Stripe`" /><icon
        name="ion:card-outline"
        size="20"
      />
    </div> -->
  </div>
</template>

<style lang="postcss" scoped>
.option {
  @apply bg-white border rounded-lg text-gray-600 cursor-pointer flex flex-1 text-sm py-3 px-4 gap-2 items-center hover:border-purple-300;

  &.active-option {
    @apply border-primary cursor-default border-opacity-50 shadow-sm pointer-events-none;

    & .checkmark {
      @apply opacity-100;
    }
  }
}
</style>
