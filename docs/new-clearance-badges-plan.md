# Plan: "New" & "Clearance" Product Card Badges (.ca)

## Goal
Replicate the .com behaviour: show a small visual chip on a product card —
**NEW** (indigo) and/or **Clearance!** (red) — based on the product belonging to
one of two hidden WooCommerce product categories. When a product is no longer new,
the merchant simply removes it from the `new-arrivals` category and the chip disappears.
No code change is ever needed to add/remove a badge — it is 100% data-driven from the
existing taxonomy.

## Taxonomy keys (source of truth)
From the WP admin (screenshots):

| Badge        | Category name  | **Slug** (the key we match on) | Count |
|--------------|----------------|--------------------------------|-------|
| `NEW`        | New Arrivals   | `new-arrivals`                 | 218   |
| `Clearance!` | Clearance!     | `clearance-items`              | 646   |

These are "hidden" categories used purely for tagging. The badge is shown whenever a
product's `productCategories` includes the matching slug.

> Note: this is independent of the homepage "New Products" row, which is just the latest
> products by `DATE` — not the `new-arrivals` category. The badge follows **category
> membership only**, exactly like the .com.

---

## Current state — how product cards get their data

`ProductCard` is already overridden in the root layer at
[components/productElements/ProductCard.vue](../components/productElements/ProductCard.vue)
(base copy in `woonuxt_base/` stays untouched per the layer rules in CLAUDE.md).

Every place a card renders and whether it currently carries category data:

| Where | Data path | Query | Category data present? |
|---|---|---|---|
| Homepage New/Clearance/Popular rows | `pages/index.vue` → `ProductRow` → `ProductCard` | `getProducts.gql` | ❌ |
| Shop page | `pages/products.vue` → `ProductGrid` → `ProductCard` | `getProducts.gql` | ❌ |
| Category page | `pages/product-category/[slug].vue` → `ProductGrid` → `ProductCard` | **inline** `PRODUCTS_PAGED_QUERY` | ❌ |
| Search / cached products | `data/products-list.json` | `scripts/build-products-cache.js` | ✅ `productCategories.nodes.slug` |
| Filtering composable | `useFiltering.ts` | `getProductsWithCursor.gql` | ✅ (`...ProductCategories`) |

**Conclusion:** the badge logic in the card is the same everywhere; we only need to make
sure the two queries that currently omit categories start returning the slugs.

---

## Design decisions

1. **Data-driven, not prop-driven.** The card reads `node.productCategories.nodes[].slug`
   and decides which chips to show. Merchant controls everything from WP. (Optional
   prop override discussed under "Enhancements".)
2. **Minimal payload.** Only request `slug` for `productCategories` (not name/count/id) on
   the list queries to keep the category-page batched fetch lean (it can pull hundreds of
   products).
3. **Centralize the slugs** in one constant so a future rename is a one-line change.
4. **New chip component** (`ProductBadges.vue`) rather than inlining markup — keeps
   `ProductCard` readable and reusable on the product page later if desired.
5. **Badge placement:** chips go **top-left**; the existing `SaleBadge` (sale %) stays
   **top-right**. Matches the .com layout where discount/clearance sit on the left.
6. **Bilingual labels** via i18n (`en-CA` / `fr-CA`) since the site is bilingual.

---

## Implementation steps

### 1. Add category slugs to the two queries that lack them

**a. `woonuxt_base/app/queries/getProducts.gql`** — this is a base-layer file.
Per the "never modify `woonuxt_base/`" rule we must **not edit it in place**. Two options:

- **Preferred:** create a root override query file
  `queries/getProducts.gql` (root layer) with the same name so the generated
  `GqlGetProducts` picks up the extended selection. *(Verify the GraphQL codegen merges
  root `queries/` — if the layer does not override `.gql` by filename, fall back to option
  below.)*
- **Fallback (cleanest, no base edit):** stop relying on `getProducts` for the homepage
  rows and shop page; switch those calls to `getProductsWithCursor` (already includes
  `...ProductCategories`). Update `pages/index.vue` (3 `useAsyncGql('getProducts', …)`
  calls) and `pages/products.vue` (1 call) accordingly, mapping the `pageInfo`/`nodes`
  shape.

> Decision needed: confirm whether root `queries/*.gql` override base by filename in this
> repo's `nuxt-graphql-client` setup. If yes → option A (smallest diff). If no → option B.

Selection to add to each product node:
```graphql
productCategories(first: 100) {
  nodes { slug }
}
```

**b. Category page inline query** —
[pages/product-category/[slug].vue](../pages/product-category/[slug].vue), constant
`PRODUCTS_PAGED_QUERY` (~line 20). Add to the `nodes { … }` selection (applies to both the
shared node fields, so add once at node level):
```graphql
nodes {
  name
  slug
  type
  databaseId
  id
  averageRating
  reviewCount
  productCategories(first: 100) { nodes { slug } }   # <-- add
  ... on SimpleProduct { … }
  ... on VariableProduct { … }
}
```
(No change to `COUNT_QUERY`.)

### 2. Centralize the badge config

New file `composables/useProductBadges.ts` (root layer):
```ts
// Slugs of the hidden WooCommerce categories that drive card badges.
export const BADGE_CATEGORY_SLUGS = {
  new: 'new-arrivals',
  clearance: 'clearance-items',
} as const;

export function useProductBadges(node: MaybeRefOrGetter<Product>) {
  const slugs = computed<string[]>(() => {
    const n = toValue(node);
    return (n?.productCategories?.nodes ?? [])
      .map((c: any) => c?.slug)
      .filter(Boolean);
  });
  const isNew = computed(() => slugs.value.includes(BADGE_CATEGORY_SLUGS.new));
  const isClearance = computed(() => slugs.value.includes(BADGE_CATEGORY_SLUGS.clearance));
  return { isNew, isClearance };
}
```

### 3. New chip component

New file `components/productElements/ProductBadges.vue` (root layer):
```vue
<script setup lang="ts">
const props = defineProps({ node: { type: Object as PropType<Product>, required: true } });
const { t } = useI18n();
const { isNew, isClearance } = useProductBadges(() => props.node);
</script>

<template>
  <div v-if="isNew || isClearance" class="flex flex-wrap gap-1.5">
    <span v-if="isClearance" class="badge badge-clearance">{{ t('messages.shop.clearance') }}</span>
    <span v-if="isNew" class="badge badge-new">{{ t('messages.shop.newArrival') }}</span>
  </div>
</template>

<style lang="postcss" scoped>
.badge { @apply rounded-md text-xs font-semibold text-white tracking-tight px-2 leading-6 shadow-sm; }
.badge-clearance { @apply bg-red-500; }   /* matches .com red "Clearance!" */
.badge-new { @apply bg-indigo-700; }      /* matches .com indigo "NEW" */
</style>
```

### 4. Wire it into the card

Edit [components/productElements/ProductCard.vue](../components/productElements/ProductCard.vue).
Inside the outer `<div class="relative group overflow-hidden">`, add the badges container
top-left (the existing `SaleBadge` stays `top-2 right-2`):
```vue
<ProductBadges :node="node" class="absolute top-2 left-2 z-10" />
```
Place it as a sibling of `<SaleBadge … />`, outside the `<NuxtLink>` image wrapper (or just
inside it but above the image) so it overlays the top-left corner.

### 5. i18n labels

Add keys to the locale files (search for existing `messages.shop.onSale` to find them):
```jsonc
// en
"shop": { "newArrival": "NEW", "clearance": "Clearance!" }
// fr
"shop": { "newArrival": "Nouveau", "clearance": "Liquidation!" }
```
(If a quick first pass is preferred, hardcode the English strings in the component and add
i18n in a follow-up.)

---

## Edge cases & risks

- **Hidden categories in GraphQL:** confirm WPGraphQL returns `new-arrivals` /
  `clearance-items` in a product's `productCategories` even though they're hidden from
  menus. Quick check: query a known clearance product and verify the slug appears.
  (Verification query in the Testing section.)
- **Payload size:** category page fetches up to hundreds of products in batches; adding
  `productCategories.nodes.slug` adds a small array per node. Acceptable, but keep the
  selection to `slug` only.
- **Caching:** the route/KV caches and `data/products-list.json` must be rebuilt so cached
  payloads include the new field. After merge run `npm run build-products-cache` and the
  cache warm step (`npm run warm-cache`) / clear stale category route cache.
- **Layer rule:** do **not** edit `woonuxt_base/`. ProductCard is already a root override;
  the new component + composable live in the root layer. Query change uses a root override
  or the `getProductsWithCursor` swap (see Step 1 decision).
- **Double badge:** a product could be both new *and* clearance — the component renders
  both chips (stacked). That's fine and matches expectations.

---

## Testing checklist

1. **GraphQL sanity** (confirm hidden cats are returned):
   ```graphql
   query { products(first: 3, where: { categoryIn: ["clearance-items"] }) {
     nodes { name productCategories { nodes { slug } } } } }
   ```
   Expect `clearance-items` in the slug list. Repeat for `new-arrivals`.
2. Homepage **Clearance Products** row → every card shows the red `Clearance!` chip.
3. Homepage **New Products** row → only cards whose product is in `new-arrivals` show the
   indigo `NEW` chip (recency-only products correctly show nothing).
4. Category page (e.g. `/product-category/inline-skates`) → clearance/new members show the
   right chips mixed in.
5. Shop page `/products` → chips render.
6. Search results → chips render (cache already carries category slugs after rebuild).
7. A product in **both** categories shows both chips without overlapping the `SaleBadge`.
8. fr-CA locale shows `Nouveau` / `Liquidation!`.
9. Mobile + desktop card layouts: chips don't cover the product image focal point.

---

## Rollout
1. Implement Steps 1–5.
2. `npm run build-products-cache` (refresh search/cache payloads with category slugs).
3. Deploy, then `npm run warm-cache` and clear stale category route cache if needed.
4. Visually verify the checklist on prod.

---

## Enhancements (optional, later)
- **Prop override** on `ProductCard` (`:force-badge="'new'"`) for curated rows where you
  want to force a chip regardless of category data.
- Reuse `ProductBadges` on the single product page (`/product/[slug]`) near the title.
- Expose the slug→label map via `app.config.ts` `storeSettings` so badges are fully
  config-driven (toggle on/off, relabel) without touching the component.
```
