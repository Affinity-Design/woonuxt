<script setup lang="ts">
const {FALLBACK_IMG} = useHelpers();

const props = defineProps({
  mainImage: {type: Object, required: true},
  gallery: {type: Object, required: true},
  node: {type: Object as PropType<Product | Variation>, required: true},
  activeVariation: {type: Object, required: false},
});

const imageLoadError = ref(false);
const galleryLoadErrors = ref<Record<string, boolean>>({});

const primaryImage = computed(() => ({
  sourceUrl: props.mainImage?.sourceUrl || FALLBACK_IMG,
  title: props.mainImage?.title || props.node?.name,
  altText: props.mainImage?.altText || props.node?.name,
  databaseId: props.mainImage?.databaseId,
}));

const imageToShow = ref(primaryImage.value);

const galleryImages = computed(() => {
  // Add the primary image to the start of the gallery and remove duplicates
  return [primaryImage.value, ...(props.gallery?.nodes || [])].filter(
    (img, index, self) => img && index === self.findIndex((t) => t?.databaseId === img?.databaseId),
  );
});

const changeImage = (image: any) => {
  if (image) {
    imageToShow.value = image;
    imageLoadError.value = false; // Reset error when changing image
  }
};

const handleMainImageError = () => {
  console.warn('Main image failed to load:', imageToShow.value.sourceUrl);
  imageLoadError.value = true;
  // Fallback to placeholder
  imageToShow.value = {
    ...imageToShow.value,
    sourceUrl: FALLBACK_IMG,
  };
};

const handleGalleryImageError = (galleryImg: any) => {
  console.warn('Gallery image failed to load:', galleryImg.sourceUrl);
  galleryLoadErrors.value[galleryImg.databaseId] = true;
};

watch(
  () => props.activeVariation,
  (newVal) => {
    if (newVal?.image) {
      const foundImage = galleryImages.value.find((img) => img.databaseId === newVal.image?.databaseId);
      if (foundImage) {
        imageToShow.value = foundImage;
        imageLoadError.value = false;
      }
    }
  },
);

const imgWidth = 640;
</script>

<template>
  <div>
    <SaleBadge :node class="absolute text-base top-4 right-4" />
    <!-- Use regular img tag for WordPress images for better Cloudflare compatibility -->
    <img
      class="rounded-xl object-contain w-full min-w-[350px]"
      :alt="imageToShow.altText || node.name"
      :title="imageToShow.title || node.name"
      :src="imageToShow.sourceUrl || FALLBACK_IMG"
      :width="imgWidth"
      :height="imgWidth"
      loading="eager"
      @error="handleMainImageError" />
    <div v-if="gallery?.nodes?.length" class="my-4 gallery-images">
      <img
        v-for="galleryImg in galleryImages"
        :key="galleryImg.databaseId"
        class="cursor-pointer rounded-xl"
        :src="galleryLoadErrors[galleryImg.databaseId] ? FALLBACK_IMG : galleryImg.sourceUrl"
        :alt="galleryImg.altText || node.name"
        :title="galleryImg.title || node.name"
        :width="imgWidth"
        :height="imgWidth"
        loading="lazy"
        @click="changeImage(galleryImg)"
        @error="handleGalleryImageError(galleryImg)" />
    </div>
  </div>
</template>

<style scoped>
.gallery-images {
  display: flex;
  overflow: auto;
  gap: 1rem;

  &::-webkit-scrollbar {
    display: none;
  }
}

.gallery-images img {
  width: 100px;
  aspect-ratio: 1/1;
  object-fit: cover;
}

@media (min-width: 768px) {
  .gallery-images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));

    img {
      width: 100%;
    }
  }
}
</style>
