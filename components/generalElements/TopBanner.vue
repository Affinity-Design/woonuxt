<script setup>
import bannerConfig from '~/data/custom/banner.json';
import {ref, computed} from 'vue';

const bannerToggle = ref(bannerConfig.enabled);

const backgroundColor = computed(() => {
  const type = bannerConfig.bannerType || 'green';
  switch (type) {
    case 'red':
      return '#ff4757';
    case 'orange':
      return '#f39c12';
    case 'green':
    default:
      return '#2ecc71';
  }
});
</script>

<template>
  <div v-if="bannerToggle">
    <div class="banner" :style="{backgroundColor: backgroundColor, color: 'white'}">
      <span v-html="bannerConfig.message"></span>
      <b v-if="bannerConfig.link">
        <a :href="bannerConfig.link" style="color: inherit; text-decoration: underline; margin-left: 5px">{{ bannerConfig.linkText || 'Click here' }}</a>
      </b>
    </div>
  </div>
</template>

<style scoped>
.banner {
  position: static;
  top: 0;
  left: 0;
  right: 0;
  text-align: center;
  padding: 12px;
  font-size: 0.9rem;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  animation: slideDown 0.5s ease-out;
}

@keyframes slideDown {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
