<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import Step0StorefrontSelector from './Step0StorefrontSelector.vue';
import Step1ReferenceCategory from './Step1ReferenceCategory.vue';
import Step2ReferenceBrand from './Step2ReferenceBrand.vue';
import Step3SizeInput from './Step3SizeInput.vue';
import Step4Intent from './Step4Intent.vue';
import Step5TargetBrand from './Step5TargetBrand.vue';
import Step6Output from './Step6Output.vue';

const calculator = useCalculator();
const storefront = useStorefrontSelection();

// Internal step 0-6 (0 = storefront selector)
const displayStep = computed(() => {
  if (!storefront.hasChosen.value) return 0;
  return calculator.currentStep.value;
});

// Displayed step number (1-based, 7 total including storefront)
const TOTAL_STEPS = 7;
const stepNumber = computed(() => displayStep.value + 1);
const progressPercent = computed(() => Math.round((stepNumber.value / TOTAL_STEPS) * 100));

// Track slide direction for animation
const slideDirection = ref<'forward' | 'backward'>('forward');
watch(displayStep, (next, prev) => {
  slideDirection.value = next > prev ? 'forward' : 'backward';
});
const transitionName = computed(() => `step-${slideDirection.value}`);

// Back handler — step 1 (displayStep 0) has no back; step 2 (displayStep 1) goes to storefront
const goBack = () => {
  if (displayStep.value === 1) {
    storefront.resetChoice();
  } else if (displayStep.value >= 2) {
    calculator.goBack();
  }
};

// Breadcrumb chips of previous answers
const breadcrumbs = computed(() => {
  const step = displayStep.value;
  const crumbs: Array<{label: string; icon?: string; toStep: number}> = [];

  if (step >= 2 && calculator.state.value.referenceCategory) {
    const opt = calculator.referenceCategoryOptions.find((o) => o.value === calculator.state.value.referenceCategory);
    if (opt) crumbs.push({label: opt.label, icon: opt.icon, toStep: 1});
  }
  if (step >= 3 && calculator.selectedReferenceBrand.value) {
    crumbs.push({label: calculator.selectedReferenceBrand.value.name, toStep: 2});
  }
  if (step >= 4 && calculator.resolvedReferenceSize.value) {
    crumbs.push({label: `${calculator.resolvedReferenceSize.value.mm} mm`, toStep: 3});
  }
  if (step >= 5 && calculator.state.value.targetCategory) {
    const opt = calculator.targetCategoryOptions.find((o) => o.value === calculator.state.value.targetCategory);
    if (opt) crumbs.push({label: opt.label, icon: opt.icon, toStep: 4});
  }
  if (step === 6 && (calculator.selectedTargetBrand.value || calculator.state.value.browseMode)) {
    const label = calculator.state.value.browseMode ? 'All brands' : calculator.selectedTargetBrand.value!.name;
    crumbs.push({label, toStep: 5});
  }
  return crumbs;
});

const activeStorefront = computed(
  () => storefront.storefrontOptions.find((o) => o.value === storefront.choice.value) ?? null,
);
</script>

<template>
  <div class="min-h-screen bg-stone-50 text-zinc-950">
    <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">

      <!-- Page header -->
      <div class="mb-8 flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">ProSkaters Place</p>
          <h1 class="mt-1 text-3xl font-black leading-tight sm:text-4xl">Roller Skate &amp; Inline Skate Size Calculator</h1>
          <p class="mt-2 text-sm leading-6 text-zinc-500">Find your perfect fit — works for rollerblades, quad skates, hockey skates &amp; more.</p>
        </div>

        <div class="flex shrink-0 flex-col items-end gap-2">
          <!-- Storefront badge (step 2+) -->
          <button
            v-if="activeStorefront && displayStep >= 1"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-bold text-zinc-700 transition hover:border-zinc-500"
            @click="storefront.resetChoice()">
            <span>{{ activeStorefront.flag }}</span>
            <span>{{ activeStorefront.label }}</span>
            <Icon name="ion:pencil-outline" class="h-3 w-3" />
          </button>

          <!-- Start over (step 2+) -->
          <button
            v-if="displayStep >= 1"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:border-zinc-500"
            @click="calculator.resetCalculator(); storefront.resetChoice();">
            <Icon name="ion:refresh-outline" class="h-3.5 w-3.5" />
            Start over
          </button>
        </div>
      </div>

      <!-- Step indicator + progress bar (all steps) -->
      <div class="mb-8">
        <!-- Step number row -->
        <div class="mb-3 flex items-end justify-between gap-2">
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-black leading-none text-emerald-700">Step {{ stepNumber }}</span>
            <span class="text-sm font-semibold text-zinc-400">of {{ TOTAL_STEPS }}</span>
          </div>
          <span class="text-xs font-semibold tabular-nums text-zinc-400">{{ progressPercent }}%</span>
        </div>

        <!-- Progress bar -->
        <div class="h-2 overflow-hidden rounded-full bg-zinc-200">
          <div
            class="h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-out"
            :style="{width: `${progressPercent}%`}" />
        </div>

        <!-- Breadcrumb chips (step 3+ = displayStep 2+) -->
        <div v-if="breadcrumbs.length" class="mt-4 flex flex-wrap items-center gap-2">
          <template v-for="(crumb, i) in breadcrumbs" :key="crumb.toStep">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900"
              @click="calculator.goToStep(crumb.toStep)">
              <Icon v-if="crumb.icon" :name="crumb.icon" class="h-3 w-3 text-zinc-400" />
              {{ crumb.label }}
              <Icon name="ion:pencil-outline" class="h-3 w-3 text-zinc-400" />
            </button>
            <Icon v-if="i < breadcrumbs.length - 1" name="ion:chevron-forward-outline" class="h-3 w-3 text-zinc-300" />
          </template>
        </div>
      </div>

      <!-- Animated step panels -->
      <Transition :name="transitionName" mode="out-in">
        <div :key="displayStep">
          <Step0StorefrontSelector v-if="displayStep === 0" />
          <Step1ReferenceCategory v-else-if="displayStep === 1" />
          <Step2ReferenceBrand v-else-if="displayStep === 2" />
          <Step3SizeInput v-else-if="displayStep === 3" />
          <Step4Intent v-else-if="displayStep === 4" />
          <Step5TargetBrand v-else-if="displayStep === 5" />
          <Step6Output v-else-if="displayStep === 6" />
        </div>
      </Transition>

      <!-- Back button (steps 2–7, i.e. displayStep 1–6) -->
      <div v-if="displayStep >= 1 && displayStep <= 6" class="mt-8 border-t border-zinc-100 pt-6">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-zinc-700"
          @click="goBack">
          <Icon name="ion:arrow-back-outline" class="h-4 w-4" />
          Back
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Forward: new step slides in from right */
.step-forward-enter-active {
  transition: opacity 0.25s ease-out, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.step-forward-leave-active {
  transition: opacity 0.18s ease-in, transform 0.18s ease-in;
}
.step-forward-enter-from { opacity: 0; transform: translateX(36px); }
.step-forward-leave-to   { opacity: 0; transform: translateX(-24px); }

/* Backward: new step slides in from left */
.step-backward-enter-active {
  transition: opacity 0.25s ease-out, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.step-backward-leave-active {
  transition: opacity 0.18s ease-in, transform 0.18s ease-in;
}
.step-backward-enter-from { opacity: 0; transform: translateX(-36px); }
.step-backward-leave-to   { opacity: 0; transform: translateX(24px); }
</style>
