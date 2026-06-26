<script lang="ts" setup>
import {debounce} from 'lodash-es';
// Root override of woonuxt_base ShippingDetails. Adds the same "confirmed this session"
// gating as BillingDetails so the ship-to-different-address path never reveals a shipping
// rate computed from a pre-filled/stale address until the customer actually edits it.
const {updateShippingLocation, isShippingAddressComplete, markShippingAddressConfirmed} = useCheckout();

const runUpdate = debounce(() => {
  if (isShippingAddressComplete.value) updateShippingLocation();
}, 800);

const onAddressInput = () => {
  markShippingAddressConfirmed();
  runUpdate();
};

const props = defineProps({
  modelValue: {type: Object, required: true},
});

const shipping = toRef(props, 'modelValue');
</script>

<template>
  <div class="grid w-full gap-4 lg:grid-cols-2">
    <div class="w-full">
      <label for="ship-first-name">{{ $t('messages.billing.firstName') }} <span class="text-red-500">*</span></label>
      <input id="ship-first-name" v-model="shipping.firstName" placeholder="John" autocomplete="given-name" type="text" required />
    </div>

    <div class="w-full">
      <label for="ship-last-name">{{ $t('messages.billing.lastName') }} <span class="text-red-500">*</span></label>
      <input id="ship-last-name" v-model="shipping.lastName" placeholder="Doe" autocomplete="family-name" type="text" required />
    </div>

    <div class="w-full col-span-full">
      <label for="ship-address1">{{ $t('messages.billing.address1') }}</label>
      <input
        id="ship-address1"
        v-model="shipping.address1"
        placeholder="O'Connell Street 47"
        autocomplete="street-address"
        @input="onAddressInput"
        @blur="onAddressInput"
        type="text"
        required />
    </div>

    <div class="w-full col-span-full">
      <label for="ship-address2">{{ $t('messages.billing.address2') }} ({{ $t('messages.general.optional') }})</label>
      <input id="ship-address2" v-model="shipping.address2" placeholder="Apartment, studio, or floor" autocomplete="address-line2" type="text" />
    </div>

    <div class="w-full">
      <label for="ship-city">{{ $t('messages.billing.city') }}</label>
      <input
        id="ship-city"
        v-model="shipping.city"
        placeholder="Toronto"
        autocomplete="locality"
        @input="onAddressInput"
        @blur="onAddressInput"
        type="text"
        required />
    </div>

    <div class="w-full">
      <label for="ship-state">{{ 'Provence' }}</label>
      <StateSelect
        id="ship-state"
        v-model="shipping.state"
        default-value="Ontario"
        country-code="CA"
        @change="onAddressInput"
        autocomplete="address-level1" />
    </div>

    <div class="w-full">
      <label for="ship-country">{{ 'Country' }}</label>
      <CountrySelect id="ship-country" v-model="shipping.country" default-value="Canada" autocomplete="country" />
    </div>

    <div class="w-full">
      <label for="ship-zip">{{ 'Postal Code' }}</label>
      <input
        id="ship-zip"
        v-model="shipping.postcode"
        placeholder="M9W4Y6"
        @input="onAddressInput"
        @blur="onAddressInput"
        autocomplete="postal-code"
        type="text"
        required />
    </div>

    <div class="w-full col-span-full">
      <label for="ship-phone">{{ $t('messages.billing.phone') }} ({{ $t('messages.general.optional') }})</label>
      <input id="ship-phone" v-model="shipping.phone" placeholder="+1 905 567 8901" autocomplete="tel" type="tel" />
    </div>
  </div>
</template>
