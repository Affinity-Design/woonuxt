<script setup lang="ts">
const calculator = useCalculator();
</script>

<template>
  <section class="grid gap-4 border-t border-zinc-200 pt-8">
    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p class="text-sm font-bold uppercase tracking-wide text-zinc-500">Step 4</p>
        <h2 class="text-2xl font-black text-zinc-950">What would you like to buy today?</h2>
      </div>

      <div v-if="calculator.resolvedReferenceSize.value" class="rounded-lg bg-zinc-950 px-4 py-3 text-white">
        <p class="text-xs font-bold uppercase tracking-wide text-zinc-300">Baseline</p>
        <p class="text-xl font-black">{{ calculator.resolvedReferenceSize.value.mm }} mm</p>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <button
        v-for="option in calculator.targetCategoryOptions"
        :key="option.value"
        type="button"
        class="min-h-32 rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
        :class="calculator.state.value.targetCategory === option.value ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-zinc-200'"
        @click="calculator.setTargetCategory(option.value)">
        <Icon :name="option.icon" class="h-7 w-7 text-emerald-700" />
        <span class="mt-4 block text-lg font-black text-zinc-950">{{ option.label }}</span>
        <span class="mt-2 block text-sm leading-6 text-zinc-600">{{ option.description }}</span>
      </button>
    </div>
  </section>
</template>
