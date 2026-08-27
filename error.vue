<script setup lang="ts">
const props = defineProps<{error: unknown}>();
const {isShowingCart, toggleCart} = useCart();
const {isShowingMobileMenu, toggleMobileMenu, addBodyClass, removeBodyClass} = useHelpers();
const {setCanadianSEO} = useCanadianSEO();

const statusCode = computed(() => {
  const numericStatus = Number((props.error as {statusCode?: unknown} | null)?.statusCode);
  return Number.isInteger(numericStatus) && numericStatus >= 400 && numericStatus <= 599 ? numericStatus : 500;
});

const publicErrorContent = computed(() => {
  if (statusCode.value === 404) {
    return {
      title: 'Page not found',
      description: 'We could not find that page. Check the address or return to the shop.',
    };
  }

  if (statusCode.value === 401 || statusCode.value === 403) {
    return {
      title: 'Page unavailable',
      description: 'You do not have access to this page. Sign in with the correct account and try again.',
    };
  }

  return {
    title: 'Something went wrong',
    description: 'We could not load this page. Please try again. If the problem continues, contact customer service.',
  };
});

const closeCartAndMenu = () => {
  toggleCart(false);
  toggleMobileMenu(false);
};

watch([isShowingCart, isShowingMobileMenu], () => {
  isShowingCart.value || isShowingMobileMenu.value ? addBodyClass('overflow-hidden') : removeBodyClass('overflow-hidden');
});

setCanadianSEO({
  title: publicErrorContent.value.title,
  description: publicErrorContent.value.description,
});
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <AppHeader />

    <Transition name="slide-from-right">
      <LazyCart v-if="isShowingCart" />
    </Transition>

    <Transition name="slide-from-left">
      <MobileMenu v-if="isShowingMobileMenu" />
    </Transition>

    <main class="container flex flex-col items-center justify-center flex-1 gap-4 min-h-[500px] px-4 text-center">
      <p class="text-sm font-semibold uppercase tracking-wide text-gray-500">Error {{ statusCode }}</p>
      <h1 class="text-3xl font-bold md:text-5xl">{{ publicErrorContent.title }}</h1>
      <p class="max-w-xl text-lg text-gray-600">{{ publicErrorContent.description }}</p>
      <button class="mt-4 rounded-lg bg-gray-800 px-6 py-3 font-semibold text-white" type="button" @click="clearError({redirect: '/'})">Return to shop</button>
    </main>

    <Transition name="fade">
      <div v-if="isShowingCart || isShowingMobileMenu" class="bg-black opacity-25 inset-0 z-40 fixed" @click="closeCartAndMenu" />
    </Transition>

    <AppFooter />
  </div>
</template>
