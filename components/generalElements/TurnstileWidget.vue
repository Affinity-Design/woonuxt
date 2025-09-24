<template>
  <div class="turnstile-container">
    <ClientOnly>
      <VueTurnstile
        :site-key="siteKey"
        v-model="turnstileToken"
        @verify="onVerify"
        @error="onError"
        @expired="onExpired"
        :reset-interval="resetInterval"
        :theme="theme"
        :size="size" />
      <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
        {{ turnstileError }}
      </div>
      <div v-if="isVerifying" class="text-blue-500 text-sm mt-2">Verifying security check...</div>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import VueTurnstile from 'vue-turnstile';

interface Props {
  modelValue?: string;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  resetInterval?: number;
  autoVerify?: boolean; // Whether to automatically verify the token when received
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'verify', token: string): void;
  (e: 'error', error: any): void;
  (e: 'expired'): void;
  (e: 'verified', success: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  theme: 'light',
  size: 'normal',
  resetInterval: 30000,
  autoVerify: false,
});

const emit = defineEmits<Emits>();

const {turnstileToken, turnstileError, isVerifying, siteKey, verifyTurnstile, onTurnstileVerify, onTurnstileError, onTurnstileExpired} = useTurnstile();

// Watch for token changes and emit to parent
watch(turnstileToken, (newToken) => {
  emit('update:modelValue', newToken);
});

// Handle verification event
const onVerify = async (token: string) => {
  onTurnstileVerify(token);
  emit('verify', token);

  // Auto-verify if enabled
  if (props.autoVerify) {
    const success = await verifyTurnstile(false);
    emit('verified', success);
  }
};

// Handle error event
const onError = (error: any) => {
  onTurnstileError(error);
  emit('error', error);
};

// Handle expired event
const onExpired = () => {
  onTurnstileExpired();
  emit('expired');
};

// Expose verification method for manual verification
defineExpose({
  verifyTurnstile,
  reset: () => {
    // Reset logic would need to be implemented in useTurnstile
  },
});
</script>

<style scoped>
.turnstile-container {
  @apply flex flex-col items-start;
}
</style>
