// types/gtag.d.ts
import "nuxt/schema";

declare module "nuxt/schema" {
  interface NuxtConfig {
    gtag?: {
      id: string;
      // Add other optional config options here if needed
    };
  }
}
