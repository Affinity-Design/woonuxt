# Architecture Overview

This project is a modern e-commerce web application that leverages a headless architecture:

- **Backend**: WordPress, used as a headless CMS, exposes content and product data via a GraphQL API (typically using WPGraphQL plugin).
- **Frontend**: Nuxt 3 (Vue.js framework), which consumes the GraphQL API and renders the storefront as a static or server-rendered site.

## High-Level Diagram

```
[WordPress + WPGraphQL] <--GraphQL--> [Nuxt 3 Frontend] --> [User's Browser]
```

- All product, category, and content data is managed in WordPress.
- Nuxt queries this data at build time (for static generation) and/or runtime (for dynamic features).
- Nuxt handles routing, SEO, caching, and rendering.

## Key Technologies
- **WordPress**: Content and product management
- **WPGraphQL**: Exposes WordPress data via GraphQL
- **Nuxt 3**: Modern Vue.js framework for SSR/SSG
- **@nuxtjs/i18n, @nuxt/image, @nuxtjs/tailwindcss**: Enhancements for internationalization, images, and styling
- **Caching & Prerendering**: Nuxt route rules and cache strategies optimize performance
