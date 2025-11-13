<script setup lang="ts">
const {wishlistLink} = useAuth();
const route = useRoute();

// Helper function to check if link is active
const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/';
  }
  return route.path.startsWith(path);
};
</script>

<template>
  <nav class="flex items-center gap-1">
    <NuxtLink
      to="/"
      :class="[
        'px-3 py-2 rounded-lg transition-colors font-medium',
        isActive('/') && route.path === '/' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      ]">
      {{ $t('messages.general.home') }}
    </NuxtLink>
    <NuxtLink
      to="/categories"
      :class="[
        'px-3 py-2 rounded-lg transition-colors font-medium',
        isActive('/categories') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      ]">
      {{ $t('messages.shop.category', 2) }}
    </NuxtLink>
    <NuxtLink
      to="/product-category/clearance-items"
      :class="[
        'px-3 py-2 rounded-lg transition-colors font-medium',
        isActive('/product-category/clearance-items') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      ]">
      {{ 'Clearance Items' }}
    </NuxtLink>
    <NuxtLink
      to="/blog"
      :class="[
        'px-3 py-2 rounded-lg transition-colors font-medium',
        isActive('/blog') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      ]">
      Blog
    </NuxtLink>
    <NuxtLink
      to="/contact"
      :class="[
        'px-3 py-2 rounded-lg transition-colors font-medium',
        isActive('/contact') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      ]">
      {{ $t('messages.general.contact') }}
    </NuxtLink>
    <NuxtLink
      class="lg:hidden px-3 py-2 rounded-lg transition-colors font-medium"
      :to="wishlistLink"
      :prefetch="false"
      :class="[isActive(wishlistLink) ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900']">
      Wishlist
    </NuxtLink>
    <NuxtLink
      class="lg:hidden px-3 py-2 rounded-lg transition-colors font-medium"
      to="/my-account"
      :prefetch="false"
      :class="[isActive('/my-account') ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900']">
      My Account
    </NuxtLink>
  </nav>
</template>
