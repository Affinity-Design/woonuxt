// nuxt.config.local.ts
export default defineNuxtConfig({
  extends: ['./woonuxt_base'],
  components: [{ path: './components', pathPrefix: false, priority: 1000 }],

  // Development runtime config
  runtimeConfig: {
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDING_EMAIL: process.env.SENDING_EMAIL,
    RECEIVING_EMAIL: process.env.RECEIVING_EMAIL,
    REVALIDATION_SECRET: process.env.REVALIDATION_SECRET,
    public: {
      stripePublishableKey: process.env.NUXT_STRIPE_PUBLISHABLE_KEY,
      exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || 'default_key',
      turnstyleSiteKey: process.env.TURNSTYLE_SITE_KEY,
      turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY,
      turnstile: {
        siteKey: process.env.TURNSTYLE_SITE_KEY,
      },
    },
  },

  // Basic development config
  devtools: { enabled: true },
  ssr: true,

  // Simple Nitro config for local testing
  nitro: {
    preset: 'node-server',
    storage: {
      // Use filesystem storage for local testing
      cache: {
        driver: 'fs',
        base: './.nuxt/cache',
      },
    },
    routeRules: {
      '/product/**': {
        cache: {
          maxAge: 60 * 60 * 24, // 24 hours
          swr: true,
        },
      },
    },
  },

  // Same hooks as original config
  hooks: {
    'pages:extend'(pages) {
      // First, remove the existing order-summary routes
      const filteredPages = pages.filter((page) => !['order-received', 'order-summary'].includes(page.name));

      // Add your custom routes
      const addPage = (name, path, file) => {
        filteredPages.push({
          name,
          path,
          file: resolve(process.cwd(), `./pages/${file}`),
        });
      };

      addPage('order-received', '/checkout/order-received/:orderId', 'order-summary.vue');
      addPage('order-summary', '/order-summary/:orderId', 'order-summary.vue');

      // Replace the pages array
      pages.splice(0, pages.length, ...filteredPages);
    },
  },

  // Other settings from original config
  routeRules: {
    '/': { prerender: true },
    '/product/**': {
      cache: {
        maxAge: 60 * 60 * 24, // 24 hours in seconds
        staleMaxAge: 60 * 60 * 24 * 7, // 7 days as stale time
        swr: true,
      },
    },
  },
});
