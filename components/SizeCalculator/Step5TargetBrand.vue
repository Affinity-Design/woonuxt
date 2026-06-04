<script setup lang="ts">
const calculator = useCalculator();

const handleTargetBrandChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  calculator.setTargetBrand(target.value);
};
</script>

<template>
  <section class="grid gap-4 border-t border-zinc-200 pt-8">
    <div>
      <p class="text-sm font-bold uppercase tracking-wide text-zinc-500">Step 5</p>
      <h2 class="text-2xl font-black text-zinc-950">Choose the brand you are shopping</h2>
    </div>

    <label class="grid gap-2">
      <span class="text-sm font-bold text-zinc-700">Target brand</span>
      <select
        class="min-h-12 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base font-semibold text-zinc-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        :value="calculator.state.value.targetBrandId || ''"
        @change="handleTargetBrandChange">
        <option value="" disabled>Select a target brand</option>
        <option v-for="brand in calculator.targetBrands.value" :key="brand.id" :value="brand.id">
          {{ brand.name }}
        </option>
      </select>
    </label>
  </section>
</template>
