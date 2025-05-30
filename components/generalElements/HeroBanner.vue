<template>
  <div class="relative mx-auto h-[420px] lg:h-[560px] xl:h-[640px]">
    <!-- Video Background -->
    <video
      class="absolute inset-0 w-full h-full object-cover"
      src="/videos/Inline-Skates-Canada.mp4"
      autoplay
      loop
      muted
      playsinline
      preload="auto"
    ></video>

    <!-- Black Overlay -->
    <div class="absolute inset-0 bg-black opacity-60"></div>

    <!-- Text Content -->
    <div
      class="container relative z-10 h-full flex flex-col items-start justify-center text-white px-6"
    >
      <h1
        class="text-2xl font-bold md:mb-4 md:text-4xl lg:text-6xl text-shadow"
      >
        ProSkaters Place Canada 🍁
      </h1>
      <h2 class="text-lg font-bold max-w-md mb-6 lg:text-3xl text-shadow">
        Canada's Premier Destination for Inline Skates, Roller Skates, and More!
      </h2>
      <div
        class="max-w-lg mb-8 text-md font-light lg:max-w-lg text-balance text-shadow"
      >
        <p>
          Experience the thrill of gliding on wheels or carving through snow
          with ProSkaters Place, Canada's top online retailer for all your
          skating and skiing needs. We offer an unparalleled selection of
          high-quality inline skates, rollerblades, roller skates, quad skates,
          scooters, skateboards, and both alpine and cross-country ski
          equipment.
        </p>
      </div>
      <NuxtLink
        class="px-8 py-3 font-bold text-gray-900 bg-white rounded-xl shadow-md hover:bg-gray-100 focus:bg-gray-100 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-black/50"
        to="/categories"
        >Shop now</NuxtLink
      >
    </div>
  </div>
</template>

<style scoped>
.text-shadow {
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
}
</style>
