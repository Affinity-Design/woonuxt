# Checkout Failure Mitigation Plan

**Status:** Plan / not yet implemented
**Author:** Investigation for Paul G.
**Date:** 2026-07-15
**Trigger:** Support incident — duplicate order (orders `500047991` + `500047994`, card charged twice) and a separate order placed with **no shipping address**.

> Scope note: this is a **plan only** — no code has been changed. It documents probable causes (grounded in current code) and the concrete changes needed to implement the precautions Paul described.

---

## 1. Incident summary

A customer (Demetrius W.) paid for skates, saw an **"error processing payment"** message, re-entered their card, paid **again**, and this time received a receipt. Result: **two real Helcim charges and two real Woo orders** for one purchase. Separately, another customer completed checkout with **no shipping address**.

Paul's read is correct: **this was not a code-level "double charge."** The code charged once per attempt. The customer was *led to retry* by a misleading failure screen — and nothing stopped the second charge from going through.

**Important nuance from the customer's own email:** they received order-confirmation emails for **both** `500047991` and `500047994`. That means attempt 1's order **was ultimately created in WooCommerce** — so the first failure was most likely not "order never posted" but **"order posted, success response never reached (or was never recognized by) the browser."** The `create-admin-order` endpoint takes a long, deliberately slow path (create → 4s settle delay → REST status update, with up to 3×30s retries), so a timeout or dropped response mid-endpoint shows the customer an error while the order completes server-side. Either failure mode (never-posted *or* posted-but-response-lost) produces the same broken UX and the same mitigations below.

---

## 2. Probable root causes (TL;DR)

| # | Symptom | Root cause | Evidence |
|---|---------|-----------|----------|
| A | Customer retried after paying | On a captured-but-failed order the frontend **ignores the server's `recoverable` flag**, silently falls through to a second (GraphQL) order attempt, and shows the generic **"There was an error processing your order. Please try again."** — it literally tells a paid customer to retry. | `composables/useCheckout.ts:376,379,511,526` |
| B | Retry produced a *second* charge + order | The duplicate guard (`idempotency:admin-order:${transactionId}`) is keyed on the **Helcim transactionId, which is minted fresh for every charge**. A re-entered-card retry = new transactionId = new key = no match. The one guard that *could* catch it (email+amount+items fingerprint) is **fail-open** and races Cloudflare KV's eventual consistency. | `create-admin-order.post.ts:96`, `helcimChargeGuard.ts:72`, `helcim.post.ts:384,409` |
| C | Order with no shipping address | **Zero programmatic address validation** in the submit path. HTML5 `required` is the only gate, and the post-payment `payNow()` call bypasses it; the server coerces missing shipping fields to `''` and creates the order anyway. | `useCheckout.ts:168`, `create-admin-order.post.ts:82,310`, `checkout/index.vue:219,539` |

The through-line for A and B: the flow is **charge-first, order-second**. Once Helcim captures the card, *any* downstream failure strands a real payment — and today the UI's response to that is "try again."

---

## 3. Root cause detail

### 3.1 The double order

**Step-by-step of what happened:**

1. Customer completes card entry → **HelcimPay.js charges the card** (transactionId `A`). This happens *before* any Woo order exists.
2. Frontend calls `/api/create-admin-order`. The browser experiences it as a failure. Two sub-cases produce identical UX:
   - the order genuinely fails to post (Worker timeout / GraphQL error / network blip), **or**
   - the order posts but the **success response is lost** (the endpoint's create → 4s delay → REST-status sequence exceeds a timeout mid-flight). *Both order emails arriving for this incident points to this second sub-case: order `500047991` exists.*
3. On a true failure the server **does the right thing**: returns `{ success: false, recoverable: true }` and persists the full payload as a stranded charge (`create-admin-order.post.ts:476`, `recordStrandedCharge`). On a lost response, the idempotency record (`completed`) already holds the order — the existing recovery endpoint would have **adopted it without creating anything new**.
4. **The frontend throws all of that away.** `processCheckout()` handles any failure with only a `console.error`, then **falls through** (no `return`) into the legacy `GqlCheckout` path — the exact session-limited path the admin API exists to bypass — which fails (`useCheckout.ts:376–387`). (Had it *succeeded*, it would have minted yet another order for the same charge — the fallback is dangerous in both directions.)
5. Customer is shown a native `alert()` + red box: **"There was an error processing your order. Please try again."** (`useCheckout.ts:511,526`). No mention their card was charged.
6. Customer retries → **new Helcim charge**, transactionId `B` → `idempotency:admin-order:B` is a brand-new key with no prior record → order `500047994` is created for the second charge.

**Why the guards didn't catch it:**

- The `idempotency:admin-order:${transactionId}` guard can only de-dupe a re-submission of the **same** charge (double-click, `$fetch` retry). It is architecturally incapable of correlating **two different charges** of the same cart (`create-admin-order.post.ts:96,101`). The codebase even documents this (`helcimChargeGuard.ts:11`).
- The guard meant to stop a *re-charge* — a fingerprint of `email::amount::lineItems` (`helcimChargeGuard.ts:72`) — has three holes:
  - **Fail-open:** wrapped in a swallow-and-continue `catch`; any KV miss silently allows the new charge (`helcim.post.ts:409`).
  - **KV eventual-consistency race:** the attempt-1 record is written at `helcim-validate` and read at attempt-2 `initialize`. Cloudflare KV propagation can lag seconds; a fast retry reads `null` (`helcimChargeGuard.ts:108`, `helcim-validate.post.ts:89`).
  - **Only runs inside `initialize`:** if the retry reuses a still-valid checkout token, it opens the modal without re-initializing and skips the check entirely (`HelcimCard.vue:641`).

### 3.2 The missing shipping address

Address entry is enforced **only** by HTML5 `required` attributes. There is no programmatic address validation anywhere in the submit path — not in `payNow()`, not in `processCheckout()`, not in the server endpoint. Concrete holes:

- **Post-payment bypass:** `handleHelcimSuccess()` calls `payNow()` **directly as a JS function** (`checkout/index.vue:539`), not via form submit — so HTML5 validation never runs. The only JS guard checks `firstName/lastName/email/phone` and **omits address entirely** (`checkout/index.vue:219`).
- **Shipping = billing by default:** `shipping = shipToDifferentAddress ? customer.shipping : billing` (`useCheckout.ts:168`). Blank billing → blank shipping.
- **Server coerces blanks:** every missing shipping field becomes `''` (country → `'CA'`) and the order is created anyway (`create-admin-order.post.ts:310`). The server validates only billing name/email/phone (`:82`).
- **Virtual-cart hole:** when the billing address block is hidden for all-virtual carts, billing (and therefore shipping) is blank with no `required` gate (`useCart.ts:245`, `BillingDetails.vue`).
- The recent "hide shipping rates until confirmed" work (`5bc96ba0`) gates only rate **display** (`showShippingRates`), never **submission** — `isShippingAddressComplete` is never checked before placing the order (`useCheckout.ts:110`).

---

## 4. What we already have (build on this, don't rebuild)

The stranded-charge recovery infrastructure is solid and under-used:

- **`server/utils/helcimOrderRecovery.ts`** — persists every stranded charge (full replay payload + email/name/total/reason) to KV under `helcim-recovery:${transactionId}`, 7-day TTL. Exposes `getStrandedCharge`, `updateStrandedCharge`, `listStrandedCharges`.
- **`server/api/recover-helcim-order.post.ts`** — reconciles a stranded charge into a real order **without re-charging**: checks the idempotency record, verifies against Woo (adopts an existing order if found), and only recreates if genuinely absent. Has secret-gated `list` and `recover-all` admin actions.
- **`HelcimCard.vue`** already contains the correct **"Your payment already went through … do not re-order … contact customerservice@"** messaging — but it's gated on the duplicate-charge block, so it never appears on the *first* order-post failure.

**Gap:** none of this is wired to the moment of failure. The frontend never reads `recoverable`, never auto-triggers recovery, and never shows the paid-but-failed notice. The pieces exist; they're just not connected.

⚠️ **Risk to flag:** stranded-charge records lived in the **`NUXT_CACHE`** namespace — and so did the **duplicate-charge fingerprints**, the **order-idempotency records**, and the **`helcim-fail:` beacons**. `clear-kv-cache-safe.js` deletes *every key* in that namespace, so a routine `clear-cache-all`/`reset-cache` wiped pending recovery state and momentarily disarmed the duplicate-charge block.

> ✅ **IMPLEMENTED (2026-07-15):** all four record types now write to a dedicated `payment` storage mount backed by a new **`NUXT_PAYMENT_DATA`** KV namespace (`server/utils/paymentStorage.ts`), which no cache tooling touches. Reads fall back to the legacy cache location so pre-migration records stay visible until their TTLs lapse, and writes fall back to the cache store if the new binding isn't configured yet (never worse than before). **Deploy prerequisite:** create the KV namespace(s) and bind them as `NUXT_PAYMENT_DATA` on the Pages project (test + prod) — see §6.

---

## 5. Mitigation plan

Ordered by priority. P0 = stops customers being double-charged or stranded.

> ✅ **IMPLEMENTED (2026-07-17, on `test`):** all of P0 — P0-1 (no fallback after a captured payment), P0-2 (hard "payment went through — do not pay again" notice with transaction reference), P0-3 (client-minted `checkoutAttemptId` via `composables/useCheckoutAttempt.ts`, enforced at Helcim initialize AND in `create-admin-order` idempotency with duplicate-charge stranding), P0-4 (server-side shipping validation), P0-5 (client shipping gate before charge) — **plus** P1-1 (auto-recovery on a captured-but-failed order via `/api/recover-helcim-order`, with manual retry button) and the P1-5 pay-affordance gate (Helcim card hidden while the notice is up). Still open: P1-2 (strongly-consistent duplicate block), P1-3 (guard on every charge path / token-reuse re-init), the remaining P1-4 `alert()` cleanups on unpaid flows, P2 items, and the D1 failure ledger.

### P0 — Stop the bleeding

| # | Change | Where | Effort |
|---|--------|-------|--------|
| P0-1 | **Branch on `recoverable` before any fallback.** When `create-admin-order` returns `{success:false, recoverable:true}` (or throws after payment), **do NOT fall through to `GqlCheckout`** — return a distinct result `{success:false, paymentCaptured:true, transactionId, recoverable:true}`. A second order attempt must never run for an already-charged card. | `useCheckout.ts` (else @375, catch @381) | S |
| P0-2 | **Hard payment-captured notice.** When `paymentCaptured` is set, render a dedicated blocking state that says: *your payment succeeded, do NOT re-order, contact customerservice@proskatersplace.com*, and show the Helcim **transactionId** as a support reference. Reuse the existing yellow block pattern from `HelcimCard.vue:788`. Suppress the generic red box + `alert()` for this case. | `checkout/index.vue` payNow @405, template @977 | M |
| P0-3 | **Stable client-minted idempotency key.** Generate one UUID per cart-checkout **before** payment, persist in `localStorage` keyed by cart hash so a reload/retry reuses the **same** value, and send it to both `/api/helcim` and `/api/create-admin-order`. Key the order-idempotency record on **this** id (independent of the per-charge Helcim transactionId). This is the single change that would have collapsed attempt 2 onto attempt 1's record and routed it to recovery instead of creating `500047994`. | `useCheckout.ts`, `create-admin-order.post.ts:96`, `helcim.post.ts` | M |
| P0-4 | **Server-side shipping validation.** Mirror the existing billing check with a required-field check on the effective shipping address (address1/city/state/postcode/country, using the billing fallback). If missing, **fail hard and route through `recordStrandedCharge`** (card is already charged) rather than writing blanks. Last line of defense. | `create-admin-order.post.ts:81,310` | S |
| P0-5 | **Client-side shipping validation as a submit gate.** Extend the `payNow()` `missingFields` guard to include the effective shipping address (reuse `isShippingAddressComplete` from `useCheckout.ts:90`). Because `handleHelcimSuccess` calls `payNow()` directly, this JS guard — not HTML5 — is the real gate. Ideally **block opening the Helcim modal** until the address is complete, so we never charge a card for an address-less order. | `checkout/index.vue:219,539` | S |

### P1 — Recover gracefully + harden

| # | Change | Where | Effort |
|---|--------|-------|--------|
| P1-1 | **Auto-trigger recovery on a captured-but-failed order.** On a `recoverable` failure, automatically call `/api/recover-helcim-order` with the transactionId (or a one-click "Retrieve my order"), and land the shopper on the receipt via the existing `@order-recovered` handler instead of dead-ending them. | `checkout/index.vue:559`, `HelcimCard.vue` | M |
| P1-2 | **Make the pre-charge duplicate block authoritative.** Move the recent-charge record off eventually-consistent KV to a strongly-consistent store (Durable Object or D1), or gate on the P0-3 client key (zero propagation delay). Record the pending charge **when the modal opens**, not only after validate, to close the race window. Remove the fail-open behavior for this specific check. | `helcimChargeGuard.ts`, `helcim.post.ts:384` | M |
| P1-3 | **Run the duplicate check on every charge, not just `initialize`.** Force a fresh `initialize` (or move the authoritative check to the validate/order-creation step every charge must pass) so a reused token can't bypass it. | `HelcimCard.vue:641` | S |
| P1-4 | **Stop showing raw errors / native `alert()` after payment.** Replace `alert()` calls (`useCheckout.ts:526,591,602,655`) with in-page states; never surface raw GraphQL messages. Any failure after `helcimPaymentComplete === true` should default to the paid-but-failed messaging, never "try again." | `useCheckout.ts`, `checkout/index.vue` | S |
| P1-5 | **Guard the shipping payload against blanks in `processCheckout`.** Short-circuit with `{success:false}` if the effective address is incomplete, so both the admin and GraphQL paths refuse a blank address. | `useCheckout.ts:168,247` | S |

### P2 — Cleanup

| # | Change | Where | Effort |
|---|--------|-------|--------|
| P2-1 | Fix the `refreshCart()` null-wipe / partial-restore that can blank an address after HTML5 passed. Snapshot before refresh; fully restore. | `checkout/index.vue:305` | M |
| P2-2 | For virtual/no-shipping carts, explicitly mark orders as no-shipping-required rather than silently sending a blank shipping address. | `useCart.ts:245`, `BillingDetails.vue` | M |

---

## 6. Durable failure logging on Cloudflare (Paul's "stash the logs" ask)

**Goal:** see *all* checkout/payment failures — even ones that never reach WordPress — with enough context to diagnose without guessing.

**Today:** `console.log` on Cloudflare Pages is **ephemeral** — Pages Functions support real-time tailing only; persistent Workers Logs/Logpush are not available to Pages projects (see Tier 2 caveat below). The only durable record is the stranded-charge KV store, which (a) only captures failures that reach `create-admin-order` *with* a transactionId, and (b) lives in the cache namespace that purges can wipe.

**Recommended design (two tiers):**

**Tier 1 — a dedicated failure ledger (primary).** Add a small `logCheckoutFailure(event)` server util that writes a structured record at **every** failure point: Helcim charge failure, order-post failure, shipping-validation reject, duplicate-block trip, and every recovery attempt. Each record: `{ id, timestamp, stage, transactionId?, idempotencyKey?, email, cartTotal, reason, requestId, userAgent }`.

- **Store: Cloudflare D1** (SQLite). Best fit for "see all failure logs" because support can actually **query** it — by email, by day, by stage, by status. A single `checkout_failures` table + a secret-gated read endpoint (extend the existing `recover-helcim-order` `list` pattern) or a tiny admin page.
- **Lighter-weight KV alternative:** a dedicated KV namespace separate from `NUXT_CACHE` so cache purges can't wipe it. Simpler, but weaker querying and subject to KV list limits.
- > ✅ **IMPLEMENTED (2026-07-15) — the KV tier:** the dedicated **`NUXT_PAYMENT_DATA`** namespace now exists in code (nitro mount `payment`, `server/utils/paymentStorage.ts` with legacy read-through). Stranded charges (`helcim-recovery:*`), duplicate-charge fingerprints (`helcim-charge:*`), order idempotency (`idempotency:admin-order:*`) and Helcim failure beacons (`helcim-fail:*`, now 30-day TTL) all live there. **Before the next deploy:** create the namespace and bind it — `npx wrangler kv namespace create NUXT_PAYMENT_DATA` (one per env, e.g. `woonuxt-payment-test` / `woonuxt-payment-prod`), then Pages project → Settings → Bindings → KV namespace → variable name `NUXT_PAYMENT_DATA`, on both Production and Preview. Until bound, writes safely fall back to `NUXT_CACHE` (pre-migration behavior). Do **not** add its ID to the `CF_KV_NAMESPACE_ID_*` env vars used by `clear-kv-cache-safe.js` — being invisible to the clear script is the point. The D1 `checkout_failures` ledger (structured, queryable, every failure stage) remains the recommended follow-up on top of this.

**Tier 2 — raw engineering logs.** ⚠️ Caveat: **Workers Logs / Logpush / Tail Workers are Workers features — Cloudflare Pages Functions only get *real-time* logs** (dashboard Live view / `wrangler pages deployment tail`), which are not persisted. So for this Pages project, "just flip on platform logging" is **not** available. Options, in order of practicality:
1. Live-tail during incident windows (`wrangler pages deployment tail`) — free, immediate, but only captures what you're watching.
2. Treat Tier 1 as the durable log (it is the recommendation anyway) — the app writes its own failure records, independent of platform log retention.
3. Longer-term: migrate the Pages project to **Workers** (Cloudflare provides a migration guide/tooling), which unlocks persistent Workers Logs + Logpush to R2. Bigger infra change — do not couple it to this incident fix.

Net: Tier 1 is the primary mechanism; Tier 2 is live-tail now, platform-persistent logs only after (if ever) a Pages→Workers migration.

**Net:** Tier 1 gives Paul the queryable "why did it fail" view he wants; Tier 2 backs it with full logs; both survive WordPress being unreachable.

---

## 7. Verification plan (once implemented)

- **Simulate order-post failure** (e.g. temporarily point `create-admin-order` at a bad WP URL in a preview) → confirm: (1) no second GraphQL attempt, (2) hard paid-notice with transactionId shown, (3) failure written to the ledger, (4) `/api/recover-helcim-order` reconciles the charge into one order.
- **Retry after failure** with the P0-3 key in place → confirm attempt 2 collapses onto attempt 1's record (no second order, routed to recovery).
- **Blank shipping** → confirm both the client gate and the server check reject before any charge / before the order is written.
- **Happy path** (normal CA order, POS order, virtual-only cart) → confirm all still complete cleanly and no false rejections.

---

## 8. Appendix — evidence index

**Failure UX:** `useCheckout.ts:339` (success branch), `:376` (admin fail → console only), `:379` (fall-through), `:511` ("Please try again."), `:526,591,602,655` (alerts), `checkout/index.vue:405,408,977,543`.
**Duplicate mechanism:** `checkout/index.vue:464,470` (per-charge transactionId), `create-admin-order.post.ts:96,101,285`, `helcimChargeGuard.ts:11,72,108`, `helcim.post.ts:384,409`, `helcim-validate.post.ts:89`, `HelcimCard.vue:641`.
**Shipping gap:** `useCheckout.ts:168,110`, `checkout/index.vue:219,539,316`, `create-admin-order.post.ts:82,310`, `useCart.ts:245`, `BillingDetails.vue:38`, `ShippingDetails.vue:69`.

*All file:line citations in this appendix were re-verified against the working tree on 2026-07-15.*
**Recovery infra:** `helcimOrderRecovery.ts` (whole file), `recover-helcim-order.post.ts` (whole file), `create-admin-order.post.ts:476,133`.

---

## 9. Ops note (non-code)

Per Pavel: replies on these threads should **reply-all** and CC **customerservice@proskatersplace.com** so responses aren't delayed. Worth adding to the support runbook (not a code change).
