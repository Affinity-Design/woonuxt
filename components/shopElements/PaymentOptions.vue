<script setup lang="ts">
const props = defineProps<{
  modelValue: string | object;
  paymentGateways: PaymentGateways;
}>();

const paymentMethod = toRef(props, 'modelValue');
const activePaymentMethod = computed<PaymentGateway>(() => paymentMethod.value as PaymentGateway);
const emits = defineEmits(['update:modelValue']);

// HELCIM ONLY: Filter to show ONLY Helcim payment method
const filterPaymentGateways = (gateways: any[]) => {
  // Only show COD gateway that has "Helcim" in the title
  return gateways.filter((gateway: any) => 
    gateway.id === 'cod' && gateway.title?.includes('Helcim')
  );
};

const updatePaymentMethod = (value: any) => {
  emits('update:modelValue', value);
  // Store selected payment method in sessionStorage to persist across cart updates
  if (process.client && value) {
    sessionStorage.setItem(
      'selectedPaymentMethod',
      JSON.stringify({
        id: value.id || value,
        title: value.title || '',
        timestamp: Date.now(),
      }),
    );
  }
};

// Function to restore payment method from storage
const restorePaymentMethod = () => {
  if (!process.client) return null;

  try {
    const stored = sessionStorage.getItem('selectedPaymentMethod');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Only restore if stored within last 30 minutes (avoid stale data)
      if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to restore payment method from storage:', e);
  }
  return null;
};

onMounted(() => {
  // Try to restore previously selected payment method first
  const storedPaymentMethod = restorePaymentMethod();

  if (storedPaymentMethod && props.paymentGateways?.nodes.length) {
    // Check if the stored payment method is still available
    const allGateways = props.paymentGateways.nodes;
    const matchingGateway = allGateways.find(
      (gateway) =>
        gateway.id === storedPaymentMethod.id || (gateway.id === 'cod' && gateway.title?.includes('Helcim') && storedPaymentMethod.title?.includes('Helcim')),
    );

    if (matchingGateway) {
      console.log('[PaymentOptions] Restoring previous payment method:', matchingGateway.title);
      updatePaymentMethod(matchingGateway);
      return; // Exit early, don't auto-select
    }
  }

  // Only auto-select if no stored method or stored method not available
  if (props.paymentGateways?.nodes.length) {
    const filteredGateways = filterPaymentGateways(props.paymentGateways.nodes);

    if (filteredGateways.length) {
      // Use the first available gateway after filtering
      console.log('[PaymentOptions] Auto-selecting first available payment method');
      updatePaymentMethod(filteredGateways[0]);
    } else {
      // Fallback to helcimjs if no gateways remain after filtering
      updatePaymentMethod('helcimjs');
    }
  }
});

// Watch for payment gateway changes (cart updates) and restore selection
watch(
  () => props.paymentGateways,
  (newGateways) => {
    if (newGateways?.nodes?.length) {
      const storedPaymentMethod = restorePaymentMethod();
      if (storedPaymentMethod) {
        const matchingGateway = newGateways.nodes.find(
          (gateway) =>
            gateway.id === storedPaymentMethod.id ||
            (gateway.id === 'cod' && gateway.title?.includes('Helcim') && storedPaymentMethod.title?.includes('Helcim')),
        );

        if (matchingGateway) {
          console.log('[PaymentOptions] Cart updated - restoring payment method:', matchingGateway.title);
          updatePaymentMethod(matchingGateway);
        }
      }
    }
  },
  {deep: true},
);
</script>

<template>
  <div class="flex gap-4 leading-tight flex-wrap">
    <div
      v-for="gateway in filterPaymentGateways(paymentGateways?.nodes || [])"
      :key="gateway.id"
      class="option"
      :class="{'active-option': gateway.id === activePaymentMethod.id}"
      @click="updatePaymentMethod(gateway)"
      :title="gateway?.description || gateway?.title || 'Payment Method'">
      <icon v-if="gateway.id === 'fkwcs_stripe'" name="ion:card-outline" size="20" />
      <icon v-else-if="gateway.id === 'paypal'" name="ion:logo-paypal" size="20" />
      <icon v-else name="ion:cash-outline" size="20" />
      <span class="whitespace-nowrap" v-html="gateway.title" />
      <icon name="ion:checkmark-circle" size="20" class="ml-auto text-primary checkmark opacity-0" />
    </div>
    <div v-if="activePaymentMethod.description" class="prose block w-full">
      <p class="text-sm text-gray-500" v-html="activePaymentMethod.description" />
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
