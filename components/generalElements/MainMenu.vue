<script setup lang="ts">
const { wishlistLink } = useAuth();
</script>

<template>
  <nav>
    <NuxtLink to="/">{{ $t("messages.general.home") }}</NuxtLink>
    <NuxtLink to="/categories">{{ $t("messages.shop.category", 2) }}</NuxtLink>
    <NuxtLink to="/product-category/clearance-items">{{
      "Clearance Items"
    }}</NuxtLink>
    <NuxtLink to="/blog">Blog</NuxtLink>
    <NuxtLink to="/contact">{{ $t("messages.general.contact") }}</NuxtLink>
    <NuxtLink class="lg:hidden" :to="wishlistLink" :prefetch="false"
      >Wishlist</NuxtLink
    >
    <NuxtLink class="lg:hidden" to="/my-account" :prefetch="false"
      >My Account</NuxtLink
    >
  </nav>
</template>
