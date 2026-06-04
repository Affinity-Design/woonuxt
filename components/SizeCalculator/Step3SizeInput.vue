<script setup lang="ts">
const calculator = useCalculator();

const fields = [
  {key: 'mm', label: 'Millimeters', placeholder: '270'},
  {key: 'eu', label: 'EU', placeholder: '42'},
  {key: 'usMen', label: 'US Men', placeholder: '9'},
  {key: 'usWomen', label: 'US Women', placeholder: '10.5'},
  {key: 'uk', label: 'UK', placeholder: '8'},
] as const;

const handleInput = (field: (typeof fields)[number]['key'], event: Event) => {
  const target = event.target as HTMLInputElement;
  calculator.setSizeInput(field, target.value);
};
</script>

<template>
  <section class="grid gap-4 border-t border-zinc-200 pt-8">
    <div>
      <p class="text-sm font-bold uppercase tracking-wide text-zinc-500">Step 3</p>
      <h2 class="text-2xl font-black text-zinc-950">Enter one known size</h2>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label v-for="field in fields" :key="field.key" class="grid gap-2">
        <span class="text-sm font-bold text-zinc-700">{{ field.label }}</span>
        <input
          type="number"
          inputmode="decimal"
          min="0"
          step="0.5"
          class="min-h-12 rounded-lg border px-4 py-3 text-base font-semibold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500"
          :class="calculator.activeSizeField.value === field.key ? 'border-emerald-600 bg-white' : 'border-zinc-300 bg-white'"
          :placeholder="field.placeholder"
          :value="calculator.state.value.sizeInput[field.key]"
          :disabled="Boolean(calculator.activeSizeField.value && calculator.activeSizeField.value !== field.key)"
          :aria-label="`${field.label} size input`"
          @input="handleInput(field.key, $event)" />
      </label>
    </div>

    <div class="min-h-10" aria-live="polite">
      <div v-if="calculator.activeSizeField.value" class="flex flex-wrap items-center gap-3 text-sm text-zinc-700">
        <span class="font-semibold">Other size fields are locked while this value is active.</span>
        <button type="button" class="font-bold text-emerald-700 underline-offset-4 hover:underline" @click="calculator.clearSizeInput">Clear value</button>
      </div>
    </div>

    <div v-if="calculator.resolvedReferenceSize.value" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p class="text-sm font-bold uppercase tracking-wide text-emerald-800">Resolved baseline</p>
      <p class="mt-1 text-2xl font-black text-emerald-950">{{ calculator.resolvedReferenceSize.value.mm }} mm</p>
      <p class="mt-2 text-sm leading-6 text-emerald-900">{{ calculator.resolvedReferenceSize.value.sourceLabel }}</p>
      <p v-if="calculator.resolvedReferenceSize.value.warning" class="mt-2 text-sm font-semibold text-amber-800">
        {{ calculator.resolvedReferenceSize.value.warning }}
      </p>
    </div>
  </section>
</template>
