<script setup lang="ts">
const route = useRoute();
const { cart, isShowingCart, toggleCart } = useCart();
const { toggleSearch } = useSearching();
const { open: openMobileNav, isOpen: isMobileNavOpen } = useMobileNav();

const cartCount = computed(() => cart.value?.contents?.itemCount || 0);
// Hide bar when a drawer (cart or mobile nav) is open — those take focus.
const isHidden = computed(() => isShowingCart.value || isMobileNavOpen.value);

function onHome() {
  navigateTo('/');
}
function onShop() {
  openMobileNav();
}
function onSearch() {
  toggleSearch();
}
function onAccount() {
  navigateTo('/my-account');
}
function onCart() {
  toggleCart();
}

function isHomeActive(): boolean {
  return route.path === '/';
}
function isAccountActive(): boolean {
  return route.path.startsWith('/my-account');
}
</script>

<template>
  <ClientOnly>
    <nav
      v-show="!isHidden"
      class="mobile-bottombar fixed bottom-0 left-0 right-0 z-[45] md:hidden flex items-stretch justify-around border-t border-black/8 bg-white/90 backdrop-blur-xl"
      aria-label="Primary mobile navigation">
      <!-- Home -->
      <button
        type="button"
        class="mobile-bottombar-item"
        :class="{ 'is-active': isHomeActive() }"
        :aria-current="isHomeActive() ? 'page' : undefined"
        aria-label="Home"
        @click="onHome">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span class="label">Home</span>
      </button>

      <!-- Shop opens the multi-level nav drawer -->
      <button
        type="button"
        class="mobile-bottombar-item"
        :class="{ 'is-active': isMobileNavOpen }"
        :aria-expanded="isMobileNavOpen"
        aria-controls="mobile-nav-drawer"
        aria-label="Shop categories"
        @click="onShop">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span class="label">Shop</span>
      </button>

      <!-- Search -->
      <button type="button" class="mobile-bottombar-item" aria-label="Search products" @click="onSearch">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span class="label">Search</span>
      </button>

      <!-- Account -->
      <button
        type="button"
        class="mobile-bottombar-item"
        :class="{ 'is-active': isAccountActive() }"
        :aria-current="isAccountActive() ? 'page' : undefined"
        aria-label="My account"
        @click="onAccount">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
        <span class="label">Account</span>
      </button>

      <!-- Cart with item count badge -->
      <button type="button" class="mobile-bottombar-item relative" aria-label="Open cart" @click="onCart">
        <span class="relative inline-flex">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span
            v-if="cartCount > 0"
            class="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] inline-flex items-center justify-center px-1 rounded-full bg-primary text-white text-[10px] font-semibold leading-none">
            {{ cartCount }}
          </span>
        </span>
        <span class="label">Cart</span>
      </button>
    </nav>
  </ClientOnly>
</template>

<style scoped>
.mobile-bottombar {
  padding-bottom: env(safe-area-inset-bottom, 0px);
  min-height: 64px;
}

.mobile-bottombar-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1 1 0%;
  gap: 2px;
  padding: 8px 4px;
  min-width: 44px;
  min-height: 44px;
  color: rgb(75 85 99);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  transition: color 150ms ease, background-color 150ms ease;
}

.mobile-bottombar-item:hover,
.mobile-bottombar-item:focus-visible {
  color: rgb(17 24 39);
}

.mobile-bottombar-item.is-active {
  color: #b45309; /* amber-700, matches mega-menu accent */
}

.mobile-bottombar-item .label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}
</style>
