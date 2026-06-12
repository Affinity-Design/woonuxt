<script setup lang="ts">
const calculator = useCalculator();

const fields = [
  {key: 'mm', label: 'Millimeters', placeholder: '270'},
  {key: 'eu', label: 'EU', placeholder: '42'},
  {key: 'usMen', label: 'US Men', placeholder: '9'},
  {key: 'usWomen', label: 'US Women', placeholder: '10.5'},
  {key: 'usYouth', label: 'US Youth', placeholder: '3'},
  {key: 'uk', label: 'UK', placeholder: '8'},
] as const;

const handleInput = (field: (typeof fields)[number]['key'], event: Event) => {
  const target = event.target as HTMLInputElement;
  calculator.setSizeInput(field, target.value);
};
</script>

<template>
  <section class="grid gap-4">
    <div>
      <h2 class="text-2xl font-black text-zinc-950">Enter your size</h2>
      <p class="mt-1 text-sm leading-6 text-zinc-500">Type one size in any unit — we'll convert everything to millimeters.</p>
    </div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <label v-for="field in fields" :key="field.key" class="grid gap-2">
        <span class="text-sm font-bold text-zinc-700">{{ field.label }}</span>
        <input
          :type="field.key === 'usYouth' ? 'text' : 'number'"
          :inputmode="field.key === 'usYouth' ? 'text' : 'decimal'"
          min="0"
          step="0.5"
          class="min-h-12 rounded-lg border px-4 py-3 text-base font-semibold uppercase text-zinc-950 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-emerald-600 disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-500"
          :class="calculator.activeSizeField.value === field.key ? 'border-2 border-emerald-600 bg-white' : 'border border-zinc-300 bg-white'"
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
      <p class="text-sm font-bold uppercase tracking-wide text-emerald-800">Your baseline</p>
      <p class="mt-1 text-2xl font-black text-emerald-950">{{ calculator.resolvedReferenceSize.value.mm }} mm</p>
      <p class="mt-2 text-sm leading-6 text-emerald-900">{{ calculator.resolvedReferenceSize.value.sourceLabel }}</p>
      <p v-if="calculator.resolvedReferenceSize.value.warning" class="mt-2 text-sm font-semibold text-amber-800">
        {{ calculator.resolvedReferenceSize.value.warning }}
      </p>
    </div>

    <button
      v-if="calculator.resolvedReferenceSize.value"
      type="button"
      class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-black text-white transition hover:bg-emerald-800 disabled:opacity-40"
      @click="calculator.continueFromSize">
      <Icon name="ion:arrow-forward-outline" class="h-5 w-5" />
      Use {{ calculator.resolvedReferenceSize.value.mm }} mm — continue
    </button>
  </section>
</template>
