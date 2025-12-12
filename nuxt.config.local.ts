// Root local Nuxt config for local development.
// Keeps the main config intact, but avoids remote WPGraphQL schema introspection failures.

export default defineNuxtConfig({
  extends: ['./woonuxt_base'],
  components: [{path: './components', pathPrefix: false, priority: 1000}],

  // LOCAL DEV NOTE:
  // The base layer includes `nuxt-graphql-client` and GraphQL documents in `woonuxt_base/app/queries/**`.
  // On startup, it runs GraphQL Codegen and tries to introspect the remote schema, which fails locally
  // due to WPGraphQL origin allowlists ("Unauthorized request origin").
  //
  // For local UI work (like testing `/search` sorting/filters using `data/products-list.json`),
  // we point codegen at a minimal local schema file to avoid remote introspection.
  'graphql-client': {
    clients: {
      default: {
        // Keep runtime host settable, but it won't be used for codegen schema when `schema` is provided.
        host: process.env.GQL_HOST || 'https://example.invalid/graphql',
        schema: './data/local-schema.graphql',
      },
    },
  },
});
