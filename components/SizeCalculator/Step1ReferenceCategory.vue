<script setup lang="ts">
const calculator = useCalculator();
</script>

<template>
  <section class="grid gap-4">
    <div>
      <p class="text-sm font-bold uppercase tracking-wide text-zinc-500">Step 1</p>
      <h2 class="text-2xl font-black text-zinc-950">What size do you already know?</h2>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <button
        v-for="option in calculator.referenceCategoryOptions"
        :key="option.value"
        type="button"
        class="min-h-36 rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
        :class="calculator.state.value.referenceCategory === option.value ? 'border-emerald-600 ring-2 ring-emerald-600' : 'border-zinc-200'"
        @click="calculator.setReferenceCategory(option.value)">
        <Icon :name="option.icon" class="h-7 w-7 text-emerald-700" />
        <span class="mt-4 block text-lg font-black text-zinc-950">{{ option.label }}</span>
        <span class="mt-2 block text-sm leading-6 text-zinc-600">{{ option.description }}</span>
      </button>
    </div>
  </section>
</template>
