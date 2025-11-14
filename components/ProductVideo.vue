<script setup lang="ts">
/**
 * Product Video Component
 *
 * Displays product demonstration videos with Schema.org VideoObject structured data
 * Supports:
 * - YouTube embeds
 * - Vimeo embeds
 * - Direct video URLs
 * - Video thumbnails
 * - VideoObject rich snippets
 */

interface Props {
  videoUrl: string;
  videoThumbnail?: string;
  videoTitle?: string;
  videoDescription?: string;
  product?: any;
}

const props = defineProps<Props>();

// Detect video platform and generate embed URL
const videoEmbedData = computed(() => {
  const url = props.videoUrl;

  // YouTube detection
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return {
      platform: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}`,
      videoId: youtubeMatch[1],
      thumbnail: props.videoThumbnail || `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`,
    };
  }

  // Vimeo detection
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;
  const vimeoMatch = url.match(vimeoRegex);
  if (vimeoMatch) {
    return {
      platform: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      videoId: vimeoMatch[1],
      thumbnail: props.videoThumbnail,
    };
  }

  // Direct video URL
  return {
    platform: 'direct',
    embedUrl: url,
    videoId: null,
    thumbnail: props.videoThumbnail,
  };
});

const displayTitle = computed(() => {
  return props.videoTitle || (props.product ? `${props.product.name} - Product Overview` : 'Product Video');
});

const displayDescription = computed(() => {
  return props.videoDescription || (props.product ? `Watch this video to learn more about ${props.product.name}` : 'Product demonstration video');
});

// Schema.org structured data is added by parent component via useProductRichSnippets
</script>

<template>
  <div class="product-video">
    <div class="video-container mb-4">
      <div v-if="videoEmbedData.platform === 'youtube' || videoEmbedData.platform === 'vimeo'" class="video-wrapper aspect-video">
        <iframe
          :src="videoEmbedData.embedUrl"
          :title="displayTitle"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          class="w-full h-full rounded-lg" />
      </div>

      <video v-else-if="videoEmbedData.platform === 'direct'" :poster="videoEmbedData.thumbnail" controls class="w-full rounded-lg">
        <source :src="videoEmbedData.embedUrl" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>

    <div v-if="videoTitle || videoDescription" class="video-info">
      <h3 v-if="videoTitle" class="text-lg font-semibold text-gray-900 mb-2">{{ displayTitle }}</h3>
      <p v-if="videoDescription" class="text-gray-600 text-sm">{{ displayDescription }}</p>
    </div>
  </div>
</template>

<style scoped>
.video-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background-color: #000;
  border-radius: 0.5rem;
}

.video-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
