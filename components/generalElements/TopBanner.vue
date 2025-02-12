<!-- components/TopBanner.vue -->

<script setup>
const { hostname } = useRequestURL();
const showBanner = computed(() => hostname !== "proskaterplace.ca");
</script>

<template>
  <div v-if="showBanner" class="banner">
    🚧 This is a test site - Visit
    <b><a href="https://proskaterplace.ca">proskaterplace.ca</a></b> the
    official Pro Skater Place website 🚧
  </div>
</template>

<style scoped>
.banner {
  position: static;
  top: 0;
  left: 0;
  right: 0;
  background-color: #ff4757;
  color: white;
  text-align: center;
  padding: 12px;
  font-size: 0.9rem;
  z-index: 9999;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Optional: Add animation */
.banner {
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
