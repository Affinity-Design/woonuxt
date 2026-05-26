<script setup lang="ts">
const calculator = useCalculator();
</script>

<template>
  <section class="grid gap-4">
    <div>
      <h2 class="text-2xl font-black text-zinc-950">Which brand are you shopping?</h2>
      <p class="mt-1 text-sm leading-6 text-zinc-500">Pick a brand for a size-matched recommendation, or browse all options sorted by price.</p>
    </div>

    <div class="grid gap-2">
      <button
        v-for="brand in calculator.targetBrands.value"
        :key="brand.id"
        type="button"
        class="flex min-h-14 items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left transition hover:border-emerald-500 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        :class="calculator.state.value.targetBrandId === brand.id ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-zinc-200'"
        @click="calculator.setTargetBrand(brand.id)">
        <span class="flex-1 text-base font-bold text-zinc-950">{{ brand.name }}</span>
        <Icon name="ion:chevron-forward-outline" class="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </div>

    <div class="mt-2 border-t border-zinc-100 pt-4">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3.5 text-left transition hover:border-zinc-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
        @click="calculator.setBrowseMode">
        <Icon name="ion:pricetags-outline" class="h-5 w-5 shrink-0 text-zinc-500" />
        <div class="flex-1">
          <span class="block text-sm font-bold text-zinc-700">Not sure yet — show all options by price</span>
          <span class="block text-xs leading-5 text-zinc-500">Browse budget-friendly picks sorted from lowest price.</span>
        </div>
        <Icon name="ion:chevron-forward-outline" class="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </div>
  </section>
</template>
