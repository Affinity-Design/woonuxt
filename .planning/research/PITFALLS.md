# Domain Pitfalls: Backorder & Condition-Based Cart/Checkout Notices

**Domain:** Headless WooCommerce condition-based cart notifications (Nuxt 3 + WPGraphQL)
**Researched:** 2026-04-09
**Overall Confidence:** HIGH — All pitfalls verified against codebase evidence

---

## Critical Pitfalls

These cause data loss, incorrect orders, or silent failures that reach customers.

### Pitfall 1: Dual Order Path Divergence — Metadata Ships on One Path, Not Both

**What goes wrong:** The project has two completely separate order-creation paths: Helcim orders via `server/api/create-admin-order.post.ts` (REST API) and standard checkout via `GqlCheckout` in `useCheckout.ts` (GraphQL mutation). Backorder/clearance metadata is implemented on one path but forgotten on the other. Orders arrive in WooCommerce admin with missing condition flags, and the fulfillment team doesn't see the warnings.

**Why it happens:** The paths diverge at `processCheckout()` around line 185 — Helcim orders branch to a `$fetch('/api/create-admin-order')` call with its own payload construction, while non-Helcim orders fall through to `GqlCheckout`. The payloads are built in completely different code blocks with different data structures. Line-item `metaData` handling is different between them: the admin API supports per-line-item meta (already used for variation attributes at line 330), while the GraphQL `checkout` mutation only supports order-level `metaData`.

**Consequences:**

- Helcim orders have per-line-item backorder flags; GraphQL orders don't (and can't without a WP plugin).
- If the GraphQL path is the fallback when admin order creation fails (lines 336-340 in `useCheckout.ts`), the fallback order loses all condition metadata.
- WooCommerce admin shows inconsistent data depending on payment method.

**Warning signs:**

- Test an order with each payment method and compare metadata in WP admin.
- Search for `metaData` in both `create-admin-order.post.ts` and `useCheckout.ts` — if one has backorder entries and the other doesn't, they're diverged.

**Prevention:**

1. Design the metadata injection in `useCartNotices` composable first, producing a structured object.
2. Have both order paths consume that same object — one function that returns `{ orderMeta, lineItemMeta }`.
3. Accept that GraphQL checkout can only do order-level meta. Document the per-line-item limitation explicitly.
4. Test both paths with a cart containing backorder + clearance items.

**Phase mapping:** Must be addressed in the order metadata injection phase. The composable that computes notice state should also export the metadata payloads for order creation.

---

### Pitfall 2: CartFragment Missing `stockStatus` on Simple Products — Data Gap Goes Undetected

**What goes wrong:** The current `CartFragment.gql` (base layer) includes `stockStatus` on `variation.node` but relies on `...SimpleProduct` spread for simple products. The PROJECT.md explicitly notes this doesn't reliably resolve `stockStatus` for simple products in cart context. If the fragment override is done incorrectly (e.g., using spread fragments instead of inline fragments), simple product backorder status silently returns `null` and those items are never flagged.

**Why it happens:** WPGraphQL uses GraphQL's type-conditional fragments (`... on SimpleProduct`). In the cart context, the `product.node` might resolve as the abstract `Product` interface, not the concrete `SimpleProduct` type, depending on WPGraphQL version and query structure. The spread `...SimpleProduct` only resolves fields when the concrete type matches. This is a known WPGraphQL behavior, not a bug.

**Consequences:**

- Simple products on backorder show no notice in cart/checkout.
- Variable products work fine (their `variation.node.stockStatus` is already directly in the fragment), masking the bug during testing if you only test with variable products.
- Customer buys a simple backorder product with no warning.

**Warning signs:**

- Add a simple product set to "On Backorder" in WooCommerce, add it to cart, and inspect the GraphQL response. If `product.node.stockStatus` is null/undefined, the fragment isn't resolving.
- Check if your overridden `CartFragment.gql` uses inline fragments (`... on SimpleProduct { stockStatus }`) or just relies on the spread.

**Prevention:**

1. Use explicit inline fragments in the overridden `CartFragment.gql` as belt-and-suspenders with the existing spreads (already recommended in STACK.md).
2. Test with **both** a simple product and a variable product on backorder simultaneously.
3. The `useCartNotices` composable must check both `item.variation?.node?.stockStatus` AND `item.product?.node?.stockStatus` with a fallback chain.
4. Add a computed property that logs a console warning if `stockStatus` is unexpectedly null for any cart item (detects the fragment issue early).

**Phase mapping:** Must be addressed in the CartFragment override phase, before the composable/component phases.

---

### Pitfall 3: Cart State Reactivity Timing — Notices Flash or Disappear After Cart Mutations

**What goes wrong:** Cart mutations (`addToCart`, `removeCartItem`, `updateItemQuantity`) set `isUpdatingCart = true`, fire the mutation, then call `refreshCart()` which replaces `cart.value`. During the mutation, the old cart data is stale. After `refreshCart()`, the new cart data arrives. Computed notices based on `cart.value` will briefly show stale state (old items) then snap to new state. If `cart.value` is briefly set to `null` (as in `resetInitialState()` on error), all notices vanish and don't come back until the next successful refresh.

**Why it happens:** `useCart.ts` line 47-49: `resetInitialState()` sets `cart.value = null`. The error handler at line 36-40 calls this on GraphQL errors. `useCartNotices` would compute `backorderItems` from `cart.value?.contents?.nodes` — if `cart.value` is null, the computed returns `[]`, hiding all notices.

**Consequences:**

- After an add-to-cart error, notices disappear even if the cart still has items (the error path nukes cart state).
- During cart updates, notices briefly show the wrong count until `refreshCart()` completes.
- If the customer sees "1 backorder item" then it flashes to "0" then back to "1" on quantity change, it erodes trust.

**Warning signs:**

- Test notice display while changing item quantities rapidly.
- Simulate a GraphQL error during `refreshCart()` (e.g., disconnect network temporarily) and check if notices survive.
- Check if `isUpdatingCart` is used to prevent notice recalculation during mutations.

**Prevention:**

1. In `useCartNotices`, guard against null cart: `const items = computed(() => cart.value?.contents?.nodes ?? [])`.
2. Don't hide notices when `isUpdatingCart` is true — show the last-known state with a loading indicator or reduced opacity instead.
3. **Do not** try to optimistically update notices (predicting what the server will return). Wait for `refreshCart()` to complete and let the computed react.
4. Test the error path explicitly by triggering `resetInitialState()`.

**Phase mapping:** Composable implementation phase. The null-guard and loading-state handling must be in the composable design from day one.

---

### Pitfall 4: Clearance Category Data Not Available in Cart Fragment — Silent Detection Failure

**What goes wrong:** Clearance detection depends on matching cart items against the `clearance-items` product category. The current `CartFragment.gql` does **not** include `productCategories` on the `product.node` block. If the fragment override adds `stockStatus` but forgets `productCategories`, clearance detection silently fails — `isInClearance()` returns `false` for every item because the category data is empty/undefined.

**Why it happens:** Developers focus on the backorder use case (stockStatus) and forget that clearance detection requires different data (category membership). The two conditions use completely different data paths, but they're being implemented in the same feature.

**Consequences:**

- Backorder notices work perfectly, creating a false sense of completeness.
- Clearance items go through checkout with no "non-refundable" warning.
- Customer disputes after purchasing clearance items.

**Warning signs:**

- After implementing the fragment override, log `item.product?.node?.productCategories` for a clearance item in the cart. If it's undefined, the fragment is missing the field.
- If `hasClearanceItems` is always `false` even with clearance items in cart, the data isn't flowing.

**Prevention:**

1. The CartFragment override must add both `stockStatus` AND `productCategories { nodes { slug databaseId } }` in a single change.
2. Write the fragment override once, covering both conditions, before building either detection path.
3. Test with a product that is both in the `clearance-items` category AND on backorder — it should trigger both notices.

**Phase mapping:** Same phase as the CartFragment override (Pitfall 2). These two data requirements must ship together.

---

## Moderate Pitfalls

These cause UX problems, incorrect display, or maintenance headaches.

### Pitfall 5: Normalization Mismatch in Stock Status Comparison

**What goes wrong:** WPGraphQL returns `stockStatus` as an enum string like `ON_BACKORDER`, but `StockStatus.vue` already has a normalization function that strips spaces, underscores, and hyphens for case-insensitive comparison. If `useCartNotices` uses a different normalization approach (e.g., strict `=== 'ON_BACKORDER'`), the comparison may fail for edge cases where the API returns inconsistently formatted values (observed in the codebase: `AttributeSelections.vue` line 113-114 calls `.toUpperCase()` before comparison, implying the raw value may not always be uppercase).

**Why it happens:** Different developers wrote `StockStatus.vue`, `AttributeSelections.vue`, and the new `useCartNotices` composable at different times. Each assumes different normalization needs.

**Prevention:**

1. Reuse the normalization pattern from `StockStatus.vue` (lines 9-17): `status.toLowerCase().replace(/[\s_-]/g, '')` then compare against normalized enum.
2. Better: Create a shared helper like `isBackorder(status: string | null | undefined): boolean` that both `StockStatus.vue` and `useCartNotices` call, using the same normalization logic.
3. Import `StockStatusEnum` from `#woo` for the canonical enum values, as `AttributeSelections.vue` does.

**Phase mapping:** Composable implementation phase. Define the helper before writing detection logic.

---

### Pitfall 6: i18n Keys Added to One Locale File But Not the Other

**What goes wrong:** Notice messages are added to `locales/en-CA.json` but not `locales/fr-CA.json` (or vice versa). The `$t()` call falls through to the default locale silently, showing English text on French pages or showing the raw key string.

**Why it happens:** It's easy to forget the second file, especially if the developer isn't bilingual and defers French translations. Nuxt i18n's fallback behavior masks the problem — it doesn't throw errors for missing keys, it just falls back silently.

**Consequences:**

- French-speaking customers see English notices or raw key strings.
- No build-time or runtime error to catch this.

**Warning signs:**

- Switch locale to `fr-CA` and navigate to a cart with backorder items. If you see English text or key strings like `messages.shop.notices.backorderSummary`, keys are missing.
- Diff `en-CA.json` and `fr-CA.json` for any keys under `messages.shop.notices.*` — they should have the same structure.

**Prevention:**

1. Add all keys to **both** locale files in the same commit.
2. Even if French translations aren't ready, add placeholder French text (e.g., `"[FR] Your order contains backorder items"`) so the structure is correct and the gap is visible.
3. Grep for every key used in `CartNotice.vue` and `useCartNotices` and verify they exist in both locale files.

**Phase mapping:** i18n phase. Must be a single atomic change covering both files.

---

### Pitfall 7: Notice Component Rendered Twice — Cart Drawer AND Cart Page Show Duplicate Banners

**What goes wrong:** The cart drawer (overlay) and the cart page are separate components that both render cart contents. If the summary banner is added to a shared parent, or if both independently call `useCartNotices()` and render `<CartNotice>`, the user sees duplicate banners when both are visible. Conversely, if notices are only added to the cart page but not the drawer, users who never visit `/cart` (going straight from drawer to checkout) never see warnings.

**Why it happens:** Headless WooCommerce sites typically have 3 cart-display surfaces: cart drawer/overlay, cart page, and checkout order summary. Each is a separate Vue component tree. The composable returns the same data (because `useState` is global), but each surface must independently decide whether and how to render notices.

**Consequences:**

- Duplicate notices confuse customers.
- Missing notices on one surface defeats the purpose.

**Warning signs:**

- Open the cart drawer and the cart page simultaneously — are notices doubled?
- Go through the entire purchase flow (add item → drawer → checkout) without visiting `/cart` — do you see the warning anywhere?

**Prevention:**

1. Map out exactly which surfaces display notices: cart drawer (line-item badges only? or also summary banner?), cart page (both), checkout (summary banner at top).
2. The composable provides data; components decide rendering. Don't put `<CartNotice>` in a layout — put it explicitly in each target component.
3. Cart drawer should show per-line-item badges but NOT summary banners (too much space). Checkout and cart page show both.

**Phase mapping:** Component rendering phase. Document the rendering matrix before implementing.

---

### Pitfall 8: Checkout `orderInput.metaData` Mutation During Reactive Computation

**What goes wrong:** The checkout code appends metadata to `orderInput.value.metaData` (an array inside a `useState` ref). If backorder/clearance metadata is pushed in a `watch()` or `computed()` that fires every time the cart updates, the same metadata keys accumulate in the array (e.g., `_contains_backorder_items: yes` appears 5 times after 5 cart updates). WooCommerce creates duplicate meta rows.

**Why it happens:** `orderInput` is a `useState` object initialized once. If code pushes to `metaData` reactively on every cart change (e.g., `watch(cart, () => { orderInput.metaData.push(...) })`), it appends every time without checking for duplicates. The existing `setOrderAttribution` function (lines 60-73 in `useCheckout.ts`) already handles this correctly with `findIndex` + update-or-push logic, but a new implementation might not follow that pattern.

**Consequences:**

- WooCommerce order has duplicate metadata entries.
- Order note appears multiple times.
- API payload is bloated.

**Warning signs:**

- After multiple cart updates, inspect `orderInput.value.metaData` in Vue DevTools or console. If backorder keys appear more than once, there's a duplication bug.
- WooCommerce admin shows the same custom field repeated.

**Prevention:**

1. **Don't push metadata reactively.** Compute the metadata at checkout submission time, not on every cart change.
2. If you must push reactively, use the `setOrderAttribution` pattern from `useCheckout.ts`: check `findIndex` by key, update if exists, push only if new.
3. Best approach: In the `processCheckout` function, right before the order API call, read `useCartNotices()` values and inject metadata once, just-in-time.

**Phase mapping:** Order metadata injection phase. Must use the idempotent pattern, not naive `push()`.

---

### Pitfall 9: Admin Order Fallback Loses Backorder Context

**What goes wrong:** When the Helcim admin order path fails (`create-admin-order.post.ts` returns an error), `useCheckout.ts` falls back to the standard `GqlCheckout` path (lines 336-340). The fallback path rebuilds the checkout payload from `orderInput`, but the Helcim-specific metadata enrichments (including any backorder/clearance flags added specifically for the admin API payload) are lost because they were constructed in the Helcim-specific code branch.

**Why it happens:** The Helcim path constructs its own payload (lines 200-410 in `useCheckout.ts`) with its own `lineItems` array and `metaData` array. When this fails and control falls through to `GqlCheckout`, the code uses the `orderInput` state which was constructed separately and doesn't include the admin-API-specific metadata.

**Prevention:**

1. Add condition metadata to `orderInput.value.metaData` (shared state) rather than only to the Helcim-specific payload.
2. Inject metadata once, before the Helcim/GraphQL branch point, so both paths inherit it.
3. Test the fallback path: simulate admin order failure and verify metadata survives on the GraphQL order.

**Phase mapping:** Order metadata injection phase. The injection point must be upstream of the Helcim/GraphQL branch.

---

## Minor Pitfalls

These cause developer confusion or minor UX inconsistencies.

### Pitfall 10: Toast vs. Inline — Using the Wrong Notice Mechanism

**What goes wrong:** A developer uses `useToast()` for backorder warnings instead of an inline `CartNotice` component. Toasts auto-dismiss after their `duration` (default ~5 seconds). The customer adds a backorder item, sees a toast flash, then it's gone. At checkout time, there's no persistent warning.

**Why it happens:** The codebase already has `useToast()` and `ToastContainer.vue`. It's the path of least resistance. The temptation is to call `toast.add({ type: 'warning', message: 'Contains backorder items' })` and ship it.

**Prevention:**

1. Rule: Cart condition notices are **inline and persistent**, not toasts.
2. Toasts are for ephemeral user actions ("Item added to cart"). Condition warnings are for persistent states ("Your cart contains backorder items").
3. Document this distinction in the composable's JSDoc.

**Phase mapping:** Component design phase.

---

### Pitfall 11: Hardcoded Clearance Category Slug Becomes Stale

**What goes wrong:** The category slug `clearance-items` or database ID `2531` is hardcoded in the composable. If the WordPress admin renames the category, changes the slug, or creates a new clearance category, detection breaks silently.

**Why it happens:** Pragmatic initial implementation, same as the hardcoded domain in `useCheckout.ts` (noted in CONCERNS.md). Works until the WordPress admin changes something.

**Prevention:**

1. Use the slug (`clearance-items`) not the database ID — slugs are more stable and human-readable.
2. Define as a constant (`const CLEARANCE_SLUG = 'clearance-items'`) in the composable, not scattered inline.
3. If detection fails (no items matched but you know clearance products exist), log a warning suggesting the slug may have changed.
4. Consider making the slug configurable via `appConfig` or runtime config for future flexibility, but don't over-engineer on day one.

**Phase mapping:** Composable implementation phase. One constant definition.

---

### Pitfall 12: `ssr: false` Pages Don't Show Notices During SSR Hydration Flash

**What goes wrong:** Cart and checkout pages are `ssr: false` (client-only rendering). This means there's a brief flash of empty content before Vue hydrates and renders the notices. If the notice component has a `<Transition>` animation that triggers on mount, every page load shows the notices animating in, which feels janky.

**Why it happens:** Client-only rendering means the initial HTML has no cart content at all. When Vue mounts, everything appears at once. Transition animations designed for dynamic state changes (item added/removed) fire on initial render.

**Prevention:**

1. Don't use enter-transitions on initial mount for notices. Only animate when the notice list changes from a previously-rendered state.
2. Use a `mounted` flag: `const isMounted = ref(false); onMounted(() => { isMounted.value = true })`. Only apply `<Transition>` after `isMounted` is true.
3. Accept that client-only pages have this characteristic. Focus transition polish on the dynamic case (item added to cart triggers new notice).

**Phase mapping:** Component styling phase. Low priority polish.

---

## Phase-Specific Warnings

| Phase Topic               | Likely Pitfall                                                                                           | Mitigation                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CartFragment.gql override | #2 (missing stockStatus on simple products), #4 (missing productCategories for clearance)                | Override both fields in a single fragment change. Test with both simple and variable products.                                      |
| useCartNotices composable | #3 (reactivity timing), #5 (normalization mismatch), #11 (hardcoded slug)                                | Null-guard cart state, reuse StockStatus normalization, define slug constant.                                                       |
| CartNotice.vue component  | #7 (duplicate rendering across surfaces), #10 (toast vs inline), #12 (SSR flash)                         | Map rendering surfaces first. Inline only, no toasts. Handle client-only mount.                                                     |
| Order metadata injection  | #1 (dual path divergence), #8 (duplicate metadata on repeated cart updates), #9 (fallback loses context) | Inject metadata upstream of Helcim/GraphQL branch. Use idempotent set-or-update pattern. Inject at submission time, not reactively. |
| i18n                      | #6 (one locale file missing keys)                                                                        | Atomic commit to both en-CA.json and fr-CA.json.                                                                                    |

---

## Sources

- Codebase analysis: `CartFragment.gql`, `useCart.ts`, `useCheckout.ts`, `create-admin-order.post.ts`, `StockStatus.vue`, `AttributeSelections.vue`, `CartCard.vue`
- Architecture: `.planning/codebase/ARCHITECTURE.md` (dual order path, two-layer pattern, SSR/client-only split)
- Known issues: `.planning/codebase/CONCERNS.md` (hardcoded domains, resetInitialState, cached-product timestamp)
- Project requirements: `.planning/PROJECT.md` (clearance category slug/ID, fragment gap, out-of-scope constraints)
- Stack research: `.planning/research/STACK.md` (fragment override pattern, metadata injection points, composable API)
