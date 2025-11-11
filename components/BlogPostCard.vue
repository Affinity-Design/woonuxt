<template>
  <NuxtLink
    :to="`/${post._path?.split('/').pop()}`"
    class="group block bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
    <div class="aspect-video bg-gray-100 overflow-hidden">
      <img
        :src="post.image || '/images/inline-skates.jpg'"
        :alt="post.alt || post.title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy" />
    </div>
    <div class="p-4">
      <h3 class="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
        {{ post.title }}
      </h3>
      <p class="text-gray-600 text-sm mt-2">
        {{ post.description }}
      </p>
      <div v-if="post.date" class="text-xs text-gray-500 mt-3">
        {{ formatDate(post.date) }}
      </div>
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
interface BlogPost {
  _path?: string;
  title: string;
  description: string;
  image?: string;
  alt?: string;
  date?: string;
}

defineProps<{
  post: BlogPost;
}>();

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};
</script>
