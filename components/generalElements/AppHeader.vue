<script setup lang="ts">
const { isShowingSearch } = useSearching();
const { scheduleClose, cancelClose } = useMegaMenu();
const { open: openMobileNav } = useMobileNav();

const scrolled = ref(false);

function onScroll() {
  scrolled.value = window.scrollY > 10;
}

onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
});
</script>

<template>
  <header
    :class="[
      'app-header sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-200',
      scrolled
        ? 'bg-white/90 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.06)]'
        : 'bg-white shadow-sm shadow-light-500',
    ]"
    @mouseleave="scheduleClose"
    @mouseenter="cancelClose">
    <div class="container flex items-center justify-between py-4">
      <div class="flex items-center gap-2">
        <!-- Hamburger: opens the multi-level drawer. Visible below md (also
             redundantly available via the bottom bar Shop button). -->
        <button
          type="button"
          class="md:hidden inline-flex items-center justify-center w-11 h-11 -ml-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
          aria-controls="mobile-nav-drawer"
          @click="openMobileNav">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Logo class="md:w-[160px]" />
      </div>
      <MainMenu class="items-center hidden gap-2 text-sm md:flex md:px-4" />
      <div class="flex justify-end items-center md:w-[160px] flex-1 ml-auto gap-4 md:gap-6">
        <ProductSearch class="hidden sm:inline-flex max-w-[320px] w-[60%]" />
        <SearchTrigger />
        <div class="flex gap-4 items-center">
          <SignInLink />
          <CartTrigger />
        </div>
      </div>
    </div>
    <Transition name="scale-y" mode="out-in">
      <div class="container mb-3 -mt-1 sm:hidden" v-if="isShowingSearch">
        <ProductSearch class="flex w-full" />
      </div>
    </Transition>

    <!-- Desktop mega menu drops below the header bar.
         Mounted inside <header> so the mouseleave on the header
         (not the panel) is what triggers the scheduled close. -->
    <MegaMenuPanel class="hidden md:block" />
  </header>
</template>

<style scoped>
.app-header {
  --header-height: 64px;
}
</style>
