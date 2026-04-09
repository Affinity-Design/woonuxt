# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**

- Vue SFCs: PascalCase — `BlogPostCard.vue`, `ProductCard.vue`, `AddToCartButton.vue`
- Composables: camelCase prefixed with `use` — `useCart.ts`, `useCanadianSEO.ts`
- Server routes: kebab-case with HTTP method suffix — `create-admin-order.post.ts`, `stock-status.get.ts`, `contact.ts`
- Utilities: camelCase — `priceConverter.ts`, `javascript.ts`
- Config overrides: `.local` suffix — `nuxt.config.local.ts`

**Composables / Functions:**

- Composable exports: `use` prefix noun in PascalCase — `useCart`, `useCanadianSEO`, `useCachedProduct`
- Internal functions: camelCase verbs — `refreshCart`, `addToCart`, `toggleCart`, `setCanadianSEO`
- Async functions: camelCase, async/await only (no `.then()` chaining)

**Variables:**

- Reactive state: camelCase — `cart`, `isPending`, `isUpdatingCart`
- `ref()` values: camelCase, no `Ref` suffix
- Constants: camelCase (no ALL_CAPS convention observed)

**TypeScript Types / Interfaces:**

- PascalCase — `BlogPost`, `AuthCredentials`, `CanadianSEOOptions`, `FAQItem`, `ProductSEOData`
- Interfaces declared inline near their usage (not in a separate global types file)
- Global WooCommerce types imported from `#woo`, GraphQL input types from `#gql`

**State Keys (`useState`):**

- String keys match composable noun — `'cart'`, `'viewer'`, `'isPending'`, `'exchangeRate'`
- Shared across composables via same key string (acts as global store key)

**Template Directives:**

- Standard Nuxt/Vue conventions: `v-if`, `v-for`, `v-model`, `:prop`, `@event`

## Code Style (Prettier)

**Tool:** Prettier (`.prettierrc` at root)

**Settings:**

- `"semi": true` — always use semicolons
- `"singleQuote": true` — single quotes for strings
- `"bracketSameLine": true` — closing `>` of JSX/template on same line
- `"printWidth": 160` — wide lines (160 chars)
- `"bracketSpacing": false` — no spaces in `{obj}` destructures → `{obj}` not `{ obj }`

**Enforcement:** No ESLint config found — Prettier is the only auto-formatter

## Vue Component Structure

**Script-first order in SFCs:**

```vue
<script setup lang="ts">
<!-- logic -->
</script>

<template>
  <!-- markup -->
</template>
```

Both attribute orderings appear (`<script setup lang="ts">` and `<script lang="ts" setup>`). The `setup lang="ts"` variant is used in root pages; `lang="ts" setup` in root-level components.

**Composition API (Composition API only — no Options API):**

- Always `<script setup>` syntax
- `defineProps<Interface>()` generic style preferred in simple components:
  ```typescript
  const props = defineProps<{post: BlogPost}>();
  ```
- Legacy object style in some older components:
  ```typescript
  const props = defineProps({
    node: {type: Object as PropType<Product>, required: true},
    index: {type: Number, default: 1},
  });
  ```
- Emits: `defineEmits` — not observed in examined components (no custom events in root layer)

**Reactivity:**

- `computed()`, `ref()`, `watch()` imported explicitly in complex pages
- `useState<T>('key', () => init)` for server/client shared reactive state
- `toRef(props, 'key')` for converting props to reactive refs

## Import Organization

**Order (observed pattern):**

1. External package named imports (`import {debounce} from 'lodash-es'`)
2. `#woo` / `#gql` type imports for WooCommerce/GraphQL types
3. `~/utils/` path aliases for local utilities
4. `#imports` explicit Nuxt imports where auto-import is unavailable or unreliable

**Nuxt Auto-Imports:**

- Composables (`useCart`, `useAuth`, `useCanadianSEO`) required **no import statement** — Nuxt auto-imports
- `useRoute`, `useHead`, `useRuntimeConfig`, `useAsyncData`, `useAsyncGql` — all auto-imported
- `GqlGetCart`, `GqlLogin`, etc. — auto-imported from nuxt-graphql-client
- `defineNuxtPlugin`, `defineEventHandler` — global Nuxt auto-imports (no import needed)

**Path Aliases:**

- `~/utils/xxx` — root utils directory
- `#gql` — GraphQL generated types
- `#woo` — WooCommerce types (likely from woonuxt_base)
- `#imports` — explicit fallback for Nuxt imports when auto-import doesn't resolve

## Error Handling

**Async Operations (composable pattern):**

```typescript
async function refreshCart(): Promise<boolean> {
  try {
    const {cart} = await GqlGetCart();
    if (cart) updateCart(cart);
    return true;
  } catch (error: any) {
    logGQLError(error);
    clearAllCookies();
    return false;
  } finally {
    isUpdatingCart.value = false;
  }
}
```

**Return pattern from async composable methods:**

```typescript
return {success: true, error: null};
return {success: false, error: error?.gqlErrors?.[0]?.message};
```

**Page 404 handling:**

```typescript
if (!post.value) {
  throw createError({statusCode: 404, statusMessage: 'Blog post not found'});
}
```

**Server API error responses:**

- Return structured objects with `statusCode` and `body` JSON string (inconsistent — not using `createError()` in server routes)
- `readBody(event)` followed by manual field validation

**GraphQL errors:**

- `logGQLError(error)` from `useHelpers()` as centralized GQL error logger
- Followed by `clearAllCookies()` and state reset on auth-related failures

**TypeScript suppression:**

- `// @ts-ignore` used in 16+ places across the codebase
- Primarily for Nuxt auto-imports inside composables (`useRoute`, `useRuntimeConfig` in `useCanadianSEO.ts`)
- Also used for GraphQL response typing in `pages/product/[slug].vue` (lines 80, 137, 374, 387, 396)
- `import.meta.server` / `import.meta.client` for SSR guards (not `process.server`)
- `typeof window === 'undefined'` also used for SSR/client detection

## Logging

**Console output style:**

- Server-side (API routes): Emoji-prefixed messages — `console.log('🛠️ Creating order...')`, `console.error('❌ Missing...')`, `console.warn('⚠️ ...')`
- Composable dev logging: `console.log('[useProducts] Sample...')` with `[composableName]` prefix
- No structured logging library used

## Comments

**JSDoc used for composable functions:**

```typescript
/**
 * @name useCart
 * @description A composable that handles the cart in local storage
 */
```

**Inline comments for complex logic:**

```typescript
// example: ?filter=pa_color[green,blue],pa_size[large]
// 👈 Critical for cookies
// IMPORTANT: Do not short-circuit on searchQuery here.
```

**File-level JSDoc blocks** in SEO composables with `@see` references

## Composable Design Patterns

**Export style is inconsistent** — both patterns used:

```typescript
// Arrow function style (SEO, auth, country composables)
export const useCanadianSEO = () => { ... };

// Named function style (cart, checkout, helpers, products)
export function useCart() { ... }
```

**Shared reactive state via `useState`:**

- Each composable owns its state keys
- State is shared across multiple component instances via the same string key
- Composables call each other (e.g., `useCart` calls `useAuth` methods)

**Singleton patterns for external initialization:**

```typescript
// Global flag prevents duplicate fetches
let initializationAttempted = false;
```

**Server-side vs client-side guarding:**

```typescript
if (import.meta.server) {
  /* SSR-only logic */
} else if (import.meta.client) {
  /* Browser-only logic */
}
```

## Template Patterns

**Styling:** Tailwind CSS utility classes throughout (no SCSS/CSS modules in root layer)

**Images:** Mix observed — `<img>` still used in `BlogPostCard.vue` and `ProductCard.vue`; `<NuxtImg>` is the project standard (per copilot instructions) but not uniformly applied

**Routing:** `<NuxtLink :to="path">` exclusively (no `<RouterLink>`)

**Icons:** `<Icon name="ion:close-outline" size="34">` via Nuxt Icon module

**i18n:** `{{ $t('messages.billing.firstName') }}` in templates; `const {t} = useI18n()` in script

**Structured data:** Inline JSON-LD via `useHead({ script: [{ type: 'application/ld+json', innerHTML: JSON.stringify({...}) }] })`

**Async data:** `await useAsyncData('cache-key', async () => {...})` in pages (not `useFetch`)

**Loading states:** `v-if="isPending"` / spinner components (PulseLoader from `vue-spinner`)

## Server API Conventions

**File location:** `server/api/` directory

**Handler pattern:**

```typescript
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();
  try {
    // ... logic
    return {success: true, data: ...};
  } catch (error) {
    throw createError({statusCode: 500, message: '...'});
  }
});
```

**Request tracing:** `const requestId = order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` pattern in complex routes

**Retry logic:** Custom `fetchWithRetry()` helper with exponential backoff in `create-admin-order.post.ts`

---

_Convention analysis: 2026-04-09_
