<script lang="ts" setup>
import { debounce } from "lodash-es";
const { updateShippingLocation } = useCheckout();
const { isBillingAddressEnabled } = useCart();

const props = defineProps({
  modelValue: { type: Object, required: true },
});

const billing = toRef(props, "modelValue");
</script>

<template>
  <div class="grid w-full gap-4 lg:grid-cols-2">
    <div class="w-full">
      <label for="first-name">{{ $t("messages.billing.firstName") }}</label>
      <input
        id="first-name"
        v-model="billing.firstName"
        placeholder="John"
        autocomplete="given-name"
        type="text"
        required
      />
    </div>

    <div class="w-full">
      <label for="last-name">{{ $t("messages.billing.lastName") }}</label>
      <input
        id="last-name"
        v-model="billing.lastName"
        placeholder="Doe"
        autocomplete="family-name"
        type="text"
        required
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full col-span-full">
      <label for="address1">{{ $t("messages.billing.address1") }}</label>
      <input
        id="address1"
        v-model="billing.address1"
        placeholder="O'Connell Street 47"
        autocomplete="street-address"
        @input="debounce(updateShippingLocation, 1000)"
        @blur="updateShippingLocation"
        type="text"
        required
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full col-span-full">
      <label for="address2"
        >{{ $t("messages.billing.address2") }} ({{
          $t("messages.general.optional")
        }})</label
      >
      <input
        id="address2"
        v-model="billing.address2"
        placeholder="Apartment, studio, or floor"
        autocomplete="address-line2"
        type="text"
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full">
      <label for="city">{{ $t("messages.billing.city") }}</label>
      <input
        id="city"
        v-model="billing.city"
        placeholder="Toronto"
        autocomplete="locality"
        @input="debounce(updateShippingLocation, 1000)"
        @blur="updateShippingLocation"
        type="text"
        required
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full">
      <label for="state">{{ "Provence" }}</label>
      <StateSelect
        id="state"
        v-model="billing.state"
        default-value="Ontario"
        country-code="CA"
        @change="updateShippingLocation"
        autocomplete="address-level1"
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full">
      <label for="country">{{ "Country" }}</label>
      <CountrySelect
        id="country"
        v-model="billing.country"
        default-value="Canada"
        @change="updateShippingLocation"
        autocomplete="country"
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full">
      <label for="zip">{{ "Postal Code" }}</label>
      <input
        id="zip"
        v-model="billing.postcode"
        placeholder="M9W4Y6"
        @input="debounce(updateShippingLocation, 800)"
        @blur="updateShippingLocation"
        autocomplete="postal-code"
        type="text"
        required
      />
    </div>

    <div v-if="isBillingAddressEnabled" class="w-full col-span-full">
      <label for="phone">{{ $t("messages.billing.phone") }} </label>
      <input
        id="phone"
        v-model="billing.phone"
        placeholder="+1 905 567 8901"
        autocomplete="tel"
        type="tel"
      />
    </div>
  </div>
</template>
