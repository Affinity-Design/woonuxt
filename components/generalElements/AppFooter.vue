<script setup lang="ts">
const {wishlistLink} = useAuth();
</script>

<template>
  <footer class="bg-white order-last">
    <div class="container flex flex-wrap justify-between gap-12 my-24 md:gap-24">
      <div class="mr-auto">
        <Logo />
        <p class="mt-4 text-sm text-gray-700 xl:max-w-md">
          Glide with confidence at ProSkaters Place Canada - Your ultimate canadian destination for premium inline skates, rollerblades, roller skates, and ski
          gear. Top brands, expert advice, and unbeatable selection await you!
        </p>
        <!-- <LangSwitcher class="mt-8" /> -->
      </div>
      <!-- info -->
      <div class="w-3/7 lg:w-auto">
        <div class="mb-1 font-semibold">Summer Sports</div>
        <div class="text-sm">
          <NuxtLink to="/product-category/inline-skates" class="py-1.5 block">{{ 'Inline Skates' }}</NuxtLink>
          <NuxtLink to="/product-category/roller-skates" class="py-1.5 block">{{ 'Roller Skates' }}</NuxtLink>
          <NuxtLink to="/product-category/replacement-parts" class="py-1.5 block">{{ 'Skate Parts' }}</NuxtLink>
          <NuxtLink to="/categories" class="py-1.5 block">All Categories</NuxtLink>
        </div>
      </div>
      <!-- TODO products -->
      <!-- <div class="w-3/7 lg:w-auto">
        <div class="mb-1 font-semibold">Products</div>
        <div class="text-sm">
          <NuxtLink to="/products" class="py-1.5 block">{{
            $t("messages.shop.newArrivals")
          }}</NuxtLink>
          <NuxtLink to="/products?filter=sale[true]" class="py-1.5 block"
            >On sale</NuxtLink
          >
          <NuxtLink
            to="/products?orderby=rating&order=ASC&filter=rating[1]"
            class="py-1.5 block"
            >Top rated</NuxtLink
          >
          <NuxtLink
            to="product-category/clearance-items"
            class="py-1.5 block"
            >{{ "Clearance" }}</NuxtLink
          >
        </div>
      </div> -->
      <!-- quick links -->
      <div class="w-3/7 lg:w-auto">
        <div class="mb-1 font-semibold">Winter Sports</div>
        <div class="text-sm">
          <NuxtLink to="/product-category/alpine-skis" class="py-1.5 block">Alpine Skis</NuxtLink>
          <NuxtLink to="/product-category/alpine-poles" class="py-1.5 block">Alpine Poles</NuxtLink>
          <NuxtLink to="/product-category/cross-country-skis" class="py-1.5 block">Cross Country Skis</NuxtLink>
          <NuxtLink to="/product-category/cross-country-poles" class="py-1.5 block">Cross Country Poles</NuxtLink>
        </div>
      </div>
      <!-- contact -->
      <div class="w-3/7 lg:w-auto">
        <div class="mb-1 font-semibold">
          {{ $t('messages.general.customerService') }}
        </div>
        <div class="text-sm">
          <NuxtLink to="/contact" class="py-1.5 block">Contact Us</NuxtLink>
          <NuxtLink to="/terms" class="py-1.5 block">Terms & Conditions</NuxtLink>
          <NuxtLink to="/privacy" class="py-1.5 block">Privacy Policy</NuxtLink>
          <NuxtLink to="/terms" class="py-1.5 block">Shipping & Returns</NuxtLink>
        </div>
      </div>
      <!-- my account -->
      <div class="w-3/7 lg:w-auto">
        <div class="mb-1 font-semibold">
          {{ $t('messages.account.myAccount') }}
        </div>
        <div class="text-sm">
          <NuxtLink to="/my-account/" class="py-1.5 block">{{ $t('messages.account.myAccount') }}</NuxtLink>
          <NuxtLink to="/my-account/?tab=orders" class="py-1.5 block">{{ $t('messages.shop.orderHistory') }}</NuxtLink>
          <NuxtLink :to="wishlistLink" class="py-1.5 block">{{ $t('messages.shop.wishlist') }}</NuxtLink>
          <NuxtLink to="/my-account/" class="py-1.5 block">{{ 'Login' }}</NuxtLink>
        </div>
      </div>
    </div>
    <div class="container border-t flex items-center justify-center mb-4">
      <div class="copywrite">
        <p class="py-4 text-xs text-center">
          <a href="https://affinitydesign.ca/website-design" :title="`Website Design`">{{ `Website Design` }}</a>
          - Implementation By
          <a href="https://affinitydesign.ca" title="Affinity Design" target="_blank">Affinity Design</a><span> - </span
          ><a href="/sitemap.xml" target="_blank" title="XML Sitemap">Sitemap</a>
        </p>
      </div>
      <SocialIcons class="ml-auto" />
    </div>
  </footer>
</template>

<style scoped lang="postcss">
a {
  @apply hover:underline;
}
</style>
