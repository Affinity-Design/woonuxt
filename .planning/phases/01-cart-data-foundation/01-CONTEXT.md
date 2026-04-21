# Phase 1: Cart Data Foundation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Override CartFragment.gql to expose stockStatus and productCategories on cart product nodes. Pure infrastructure — no user-facing changes.

</domain>

<decisions>
## Implementation Decisions

### Agent's Discretion
All implementation choices are at the agent's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `woonuxt_base/app/queries/fragments/CartFragment.gql` — base cart fragment to override
- `woonuxt_base/app/queries/fragments/ProductCategoriesFragment.gql` — existing productCategories fragment (inline approach preferred over spread)
- `composables/useCart.ts` — uses `GqlGetCart` auto-import, will consume updated fragment

### Established Patterns
- GraphQL queries use nuxt-graphql-client with auto-generated TypeScript types (`#gql` import alias)
- `documentPaths` in nuxt.config.ts controls which .gql files are used for codegen
- Fragment overrides require copying entire queries directory to avoid duplicate fragment errors

### Integration Points
- `nuxt.config.ts` graphql-client.documentPaths must point to root `queries/`
- `useCart.ts` auto-imports `GqlGetCart` which uses `...Cart` fragment spread
- Phase 2 composable will consume `productCategories` from cart product nodes

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
