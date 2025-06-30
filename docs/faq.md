# FAQ: Project Stack & Workflow

**Q: Why use WordPress as a headless CMS?**
A: WordPress is familiar, flexible, and has a rich ecosystem. Using it headless with GraphQL allows us to decouple the backend from the frontend for better performance and flexibility.

**Q: How does Nuxt fetch data from WordPress?**
A: Nuxt uses GraphQL queries (via composables like `useAsyncGql`) to fetch data from the WPGraphQL endpoint.

**Q: What is prerendering and why is it used?**
A: Prerendering generates static HTML for certain routes at build time, improving performance and SEO. See `nuxt.config.ts` for which routes are prerendered.

**Q: How is caching handled?**
A: Nuxt's route rules define cache strategies for different routes, e.g., product categories are cached for 7 days.

**Q: How do I add a new data type or query?**
A: Add the data type in WordPress, expose it via WPGraphQL, then create a new GraphQL query in Nuxt and use it in your pages/components.

**Q: Where do I configure the GraphQL endpoint?**
A: In your environment variables (e.g., `.env` file) and referenced in Nuxt's runtime config.
