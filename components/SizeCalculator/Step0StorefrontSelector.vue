<script setup lang="ts">
import {storefrontOptions, useStorefrontSelection} from '~/composables/useStorefrontSelection';

const storefront = useStorefrontSelection();
</script>

<template>
  <section class="grid gap-5">
    <div>
      <h2 class="text-2xl font-black text-zinc-950">Select your country</h2>
      <p class="mt-1 text-sm leading-6 text-zinc-500">Product links will open on your chosen store in a new tab.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <button
        v-for="option in storefrontOptions"
        :key="option.value"
        type="button"
        class="flex items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600 sm:flex-col sm:items-start sm:gap-3 sm:py-5"
        :class="storefront.choice.value === option.value ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-zinc-200'"
        @click="storefront.setChoice(option.value)">
        <span class="text-3xl leading-none">{{ option.flag }}</span>
        <div>
          <span class="block text-base font-black text-zinc-950">{{ option.label }}</span>
          <span class="mt-0.5 block text-xs leading-5 text-zinc-500">{{ option.description }}</span>
        </div>
        <Icon
          v-if="storefront.choice.value === option.value"
          name="ion:checkmark-circle"
          class="ml-auto h-5 w-5 shrink-0 text-emerald-600 sm:hidden" />
      </button>
    </div>
  </section>
</template>
