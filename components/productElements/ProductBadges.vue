<script setup lang="ts">
const props = defineProps({
  node: {type: Object as PropType<Product>, required: true},
});

const {t} = useI18n();
const {isNew, isClearance} = useProductBadges(() => props.node);
</script>

<template>
  <div v-if="isNew || isClearance" class="flex flex-wrap gap-1.5">
    <span v-if="isClearance" class="badge badge-clearance">{{ t('messages.shop.clearance') }}</span>
    <span v-if="isNew" class="badge badge-new">{{ t('messages.shop.newArrival') }}</span>
  </div>
</template>

<style lang="postcss" scoped>
.badge {
  @apply rounded-md text-xs font-semibold text-white tracking-tight px-2 leading-6 shadow-sm;
}
.badge-clearance {
  @apply bg-red-500;
} /* matches .com red "Clearance!" */
.badge-new {
  @apply bg-indigo-700;
} /* matches .com indigo "NEW" */
</style>
