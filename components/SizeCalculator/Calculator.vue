<script setup lang="ts">
import {nextTick, ref, watch} from 'vue';
import Step1ReferenceCategory from './Step1ReferenceCategory.vue';
import Step2ReferenceBrand from './Step2ReferenceBrand.vue';
import Step3SizeInput from './Step3SizeInput.vue';
import Step4Intent from './Step4Intent.vue';
import Step5TargetBrand from './Step5TargetBrand.vue';
import Step6Output from './Step6Output.vue';

const calculator = useCalculator();
const activeStepRegion = ref<HTMLElement | null>(null);

watch(
  () => calculator.currentStep.value,
  async () => {
    await nextTick();
    activeStepRegion.value?.focus();
  },
);
</script>

<template>
  <section class="bg-stone-50 text-zinc-950">
    <div class="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header class="grid gap-5 border-b border-zinc-200 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div class="max-w-3xl">
          <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">ProSkaters Place</p>
          <h1 class="mt-3 text-4xl font-black leading-tight text-zinc-950 sm:text-5xl">Skate Size Calculator</h1>
          <p class="mt-4 text-lg leading-8 text-zinc-700">
            Convert a size you already trust into a millimeter baseline, then match it to stocked skate and ski-boot brands.
          </p>
        </div>

        <button
          type="button"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:border-zinc-500 hover:text-zinc-950"
          @click="calculator.resetCalculator">
          <Icon name="ion:refresh-outline" class="h-5 w-5" />
          Reset
        </button>
      </header>

      <div class="h-2 overflow-hidden rounded bg-zinc-200" role="progressbar" :aria-valuenow="calculator.currentStep.value" aria-valuemin="1" aria-valuemax="6">
        <div class="h-full bg-emerald-600 transition-all" :style="{width: `${(calculator.currentStep.value / 6) * 100}%`}" />
      </div>

      <div ref="activeStepRegion" tabindex="-1" class="flex flex-col gap-8 focus:outline-none">
        <Step1ReferenceCategory />
        <Step2ReferenceBrand v-if="calculator.currentStep.value >= 2" />
        <Step3SizeInput v-if="calculator.currentStep.value >= 3" />
        <Step4Intent v-if="calculator.currentStep.value >= 4" />
        <Step5TargetBrand v-if="calculator.currentStep.value >= 5" />
        <Step6Output v-if="calculator.currentStep.value >= 6" />
      </div>
    </div>
  </section>
</template>
