<script setup lang="ts">
const { FALLBACK_IMG } = useHelpers();
const props = defineProps({
  node: { type: Object, required: true },
  imageLoading: { type: String as PropType<"lazy" | "eager">, default: "lazy" },
});

const imgWidth = 220;
const imgHeight = Math.round(imgWidth * 1.125);

// Track if we've already fallen back to prevent infinite loops
const hasErrored = ref(false);

// Function to get the local image path based on category name
const getLocalImagePath = (categoryName: string) => {
  if (!categoryName) return FALLBACK_IMG;

  // Create a map for special case replacements
  const specialCases: Record<string, string> = {
    "Inline Skate Wheels | Wheels For Rollerblades":
      "Inline Skate Wheels   Wheels For Rollerblades",
    "Roller Skates | Quad Skates": "Roller Skates   Quad Skates",
    "Electric Boards / e-boards": "Electric Boards   e-boards",
    "Inline Skates / Rollerblades": "Inline Skates   Rollerblades",
    "Trick Scooters | Stunt Scooters | Pro Scooters": "Trick Scooters",
  };

  // Get the filename - use special case if defined, otherwise use exact category name
  const filename = specialCases[categoryName] || categoryName;

  // Add debugging for problematic cases
  if (specialCases[categoryName]) {
    console.log(`Special case: "${categoryName}" → "${filename}"`);
  }

  // Return the exact filename as is - no sanitization
  return `/images/${filename}.jpeg`;
};

// Get the image path for this category
const imageSrc = computed(() => {
  // If we've already tried the local image and it errored,
  // use the fallback or the original image from WordPress
  if (hasErrored.value) {
    return props.node.image?.sourceUrl || FALLBACK_IMG;
  }
  return getLocalImagePath(props.node.name);
});

// Handle image error - use a more robust approach
const handleImageError = (event) => {
  console.log(`Image error for category: "${props.node.name}"`);
  console.log(`Failed URL: ${event.target.src}`);

  // Only change the source if we haven't already errored
  if (!hasErrored.value) {
    hasErrored.value = true;

    // Force a refresh to use the fallback image
    if (props.node.image?.sourceUrl) {
      console.log(
        `Falling back to WordPress image: ${props.node.image.sourceUrl}`
      );
      event.target.src = props.node.image.sourceUrl;
    } else {
      console.log(`Falling back to default image: ${FALLBACK_IMG}`);
      event.target.src = FALLBACK_IMG;
    }
  }
};
</script>

<template>
  <NuxtLink
    v-if="node"
    :to="`/product-category/${decodeURIComponent(node.slug)}`"
    class="relative flex justify-center overflow-hidden border border-white rounded-xl item snap-mandatory snap-x"
  >
    <NuxtImg
      :width="imgWidth"
      :height="imgHeight"
      class="absolute inset-0 object-cover w-full h-full"
      :src="imageSrc"
      :alt="node.name"
      :title="node.name"
      :loading="imageLoading"
      :sizes="`sm:${imgWidth / 2}px md:${imgWidth}px`"
      placeholder
      placeholder-class="blur-xl"
      @error="handleImageError"
    />
    <div
      class="absolute inset-x-0 bottom-0 opacity-50 bg-gradient-to-t from-black to-transparent h-1/2"
    />
    <span
      class="relative z-10 mt-auto mb-2 text-sm font-semibold text-white capitalize md:text-base md:mb-4"
      v-html="node.name"
    />
  </NuxtLink>
</template>

<style lang="postcss" scoped>
.item {
  scroll-snap-align: start;
  scroll-snap-stop: always;
  aspect-ratio: 4 / 5;
}
</style>
