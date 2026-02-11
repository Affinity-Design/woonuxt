<script setup>
const props = defineProps({
  modelValue: {type: String, default: 'CA'},
});

const emit = defineEmits(['update:modelValue']);

// Canada-only - hard locked
const canadaOnly = [{code: 'CA', name: 'Canada'}];

// Ensure Canada is always selected on mount
onMounted(() => {
  if (props.modelValue !== 'CA') {
    emit('update:modelValue', 'CA');
  }
});

function select(evt) {
  // Always emit CA regardless of selection attempt
  emit('update:modelValue', 'CA');
}
</script>

<template>
  <select :value="'CA'" @change="select" required class="h-[42px] bg-gray-100 cursor-not-allowed" disabled>
    <option value="CA" selected>Canada</option>
  </select>
</template>
