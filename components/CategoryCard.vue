<script setup lang="ts">
const {FALLBACK_IMG} = useHelpers();
const props = defineProps({
  node: {type: Object, required: true},
  imageLoading: {type: String as PropType<'lazy' | 'eager'>, default: 'lazy'},
});

const imgWidth = 220;
const imgHeight = Math.round(imgWidth * 1.125);

// Track if we've already fallen back to prevent infinite loops
const hasErrored = ref(false);

// Function to convert category names to dash-separated filenames
const convertToDashed = (categoryName: string) => {
  if (!categoryName) return '';

  // Special case mapping for categories with custom image names
  const specialCases: Record<string, string> = {
    'Trick Scooters | Stunt Scooters | Pro Scooters': 'Trick-Scooters',
  };

  // If we have a special case mapping, use it
  if (specialCases[categoryName]) {
    return specialCases[categoryName];
  }

  // Otherwise apply standard conversion
  return (
    categoryName
      // First handle special characters that might need specific replacements
      .replace(/\|/g, '-') // Replace pipe with dash
      .replace(/\//g, '-') // Replace forward slash with dash
      .replace(/!/g, '') // Remove exclamation marks
      .replace(/&/g, 'and') // Replace & with 'and'
      // Replace spaces with dashes
      .replace(/\s+/g, '-')
      // Remove any other special characters
      .replace(/[^\w\-]/g, '')
      // Ensure no double dashes
      .replace(/--+/g, '-')
  );
};

// Function to get the local image path based on category name
const getLocalImagePath = (categoryName: string) => {
  if (!categoryName) return FALLBACK_IMG;

  // Convert the category name to a dash-separated filename
  const dashedName = convertToDashed(categoryName);

  // Return the path with the dashed filename
  return `/images/${dashedName}.jpeg`;
};

// Get the image path for this category
const imageSrc = computed(() => {
  // If we've already tried the local image and it errored,
  // use the fallback or the original image from WordPress
  if (hasErrored.value) {
    return props.node.image?.sourceUrl || FALLBACK_IMG;
  }

  // If we have an explicit imageFilename, use it directly
  if (props.node.imageFilename) {
    return `/images/${props.node.imageFilename}`;
  }

  return getLocalImagePath(props.node.name);
});

// Handle image error
const handleImageError = (event) => {
  // Only change the source if we haven't already errored
  if (!hasErrored.value) {
    hasErrored.value = true;
  }
};
</script>

<template>
  <NuxtLink
    v-if="node"
    :to="`/product-category/${decodeURIComponent(node.slug)}`"
    class="group relative flex justify-center overflow-hidden border border-gray-200 rounded-xl item snap-mandatory snap-x hover:shadow-lg transition-shadow">
    <NuxtImg
      :width="imgWidth"
      :height="imgHeight"
      class="absolute inset-0 object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
      :src="imageSrc"
      :alt="node.name"
      :title="node.name"
      :loading="imageLoading"
      :sizes="`sm:${imgWidth / 2}px md:${imgWidth}px`"
      placeholder
      placeholder-class="blur-xl"
      @error="handleImageError" />
    <div class="absolute inset-x-0 bottom-0 opacity-50 bg-gradient-to-t from-black to-transparent h-1/2" />
    <span
      class="relative z-10 mt-auto mb-2 text-sm font-semibold text-white capitalize md:text-base md:mb-4 group-hover:scale-105 transition-transform duration-300"
      v-html="node.name" />
  </NuxtLink>
</template>

<style lang="postcss" scoped>
.item {
  scroll-snap-align: start;
  scroll-snap-stop: always;
  aspect-ratio: 4 / 5;
}
</style>
