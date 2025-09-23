<script setup>
const {hostname} = useRequestURL();
import {ref, computed, onBeforeMount, watch, nextTick} from 'vue';

const bannerToggle = ref(false);

// For displaying the test site banner (red)
const isTestSite = computed(() => hostname !== 'proskatersplace.ca');

// For displaying the live beta banner (green)
const isLiveBeta = computed(() => hostname === 'proskatersplace.ca');
</script>

<template>
  <div v-if="bannerToggle">
    <!-- Test Site Banner (red) -->
    <div v-if="isTestSite" class="banner test-banner">
      🚧 This is a test site - Visit
      <b><a href="https://proskatersplace.ca">proskatersplace.ca</a></b> the official ProSkaters Place website 🚧
    </div>

    <!-- Live Beta Banner (green) -->
    <div v-if="isLiveBeta" class="banner beta-banner">
      🚀 We are in live beta! If you experience any issues, please
      <b><a href="/contact">contact us</a></b> or use our other site <b><a href="https://proskatersplace.com">proskatersplace.com</a></b> to checkout your
      purchase.
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

.test-banner {
  background-color: #ff4757;
  color: white;
}

.beta-banner {
  background-color: #2ecc71;
  color: white;
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
