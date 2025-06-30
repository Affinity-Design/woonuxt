# Data Flow: WordPress to Nuxt

## 1. Content Management
- All products, categories, and content are created and managed in WordPress.
- WPGraphQL plugin exposes this data via a GraphQL endpoint.

## 2. Data Fetching in Nuxt
- Nuxt uses composables (e.g., `useAsyncGql`) to query the GraphQL API.
- Example: Fetching products for the homepage:
  ```js
  const { data: newProductsData } = await useAsyncGql("getProducts", {
    first: 5,
    orderby: ProductsOrderByEnum.DATE,
  });
  ```
- Data is fetched at build time for static pages (prerendering) and at runtime for dynamic routes.

## 3. Rendering & Caching
- Nuxt renders pages using the fetched data.
- Route rules in `nuxt.config.ts` define which pages are prerendered, cached, or server-rendered.
- Example: `/product-category/**` routes are prerendered and cached for 7 days.

## 4. User Interaction
- Users interact with the Nuxt frontend, which may make additional GraphQL queries as needed (e.g., search, filters).
