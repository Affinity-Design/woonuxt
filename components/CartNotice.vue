<script setup lang="ts">
interface Props {
  type?: 'warning' | 'info' | 'error';
  message: string;
  icon?: string;
  dismissible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'warning',
  icon: '',
  dismissible: false,
});

const isDismissed = ref(false);

const typeStyles: Record<string, string> = {
  warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
  error: 'bg-red-50 border-red-300 text-red-800',
};

const iconNames: Record<string, string> = {
  warning: 'ion:warning',
  info: 'ion:information-circle',
  error: 'ion:alert-circle',
};

const resolvedIcon = computed(() => props.icon || iconNames[props.type]);
</script>

<template>
  <div v-if="!isDismissed" :class="['flex items-start gap-3 rounded-lg border p-3 text-sm', typeStyles[type]]" role="alert">
    <Icon :name="resolvedIcon" class="mt-0.5 h-5 w-5 flex-shrink-0" />
    <span class="flex-1">{{ message }}</span>
    <button
      v-if="dismissible"
      type="button"
      class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
      aria-label="Dismiss notice"
      @click="isDismissed = true">
      <Icon name="ion:close" class="h-4 w-4" />
    </button>
  </div>
</template>
