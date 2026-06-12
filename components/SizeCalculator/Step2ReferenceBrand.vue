<script setup lang="ts">
const calculator = useCalculator();

const handleBrandChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  calculator.setReferenceBrand(target.value);
};
</script>

<template>
  <section class="grid gap-4">
    <div>
      <h2 class="text-2xl font-black text-zinc-950">Which brand are you sizing from?</h2>
      <p class="mt-1 text-sm leading-6 text-zinc-500">Select the brand whose sizing chart you already trust.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-[minmax(0,28rem)_auto] sm:items-end">
      <label class="grid gap-2">
        <span class="text-sm font-bold text-zinc-700">Brand</span>
        <select
          class="min-h-12 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-semibold text-zinc-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          :value="calculator.state.value.referenceBrandId || ''"
          @change="handleBrandChange">
          <option value="" disabled>Select a brand</option>
          <option v-for="brand in calculator.referenceBrands.value" :key="brand.id" :value="brand.id">
            {{ brand.name }}
          </option>
        </select>
      </label>

      <a
        v-if="calculator.selectedReferenceBrand.value?.officialSizingUrl"
        :href="calculator.selectedReferenceBrand.value.officialSizingUrl"
        target="_blank"
        rel="noopener nofollow"
        class="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-800 transition hover:border-zinc-500">
        <Icon name="ion:open-outline" class="h-5 w-5" />
        Official chart
      </a>
    </div>
  </section>
</template>
