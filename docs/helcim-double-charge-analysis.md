# Helcim Double-Charge — Root-Cause Analysis & Mitigation

**Status:** Phase 1 (detection + non-blocking warning) shipped in this PR · Phases 2–3 pending
**Severity:** High — customers can be charged twice for one order; erodes trust and creates manual refund work.
**Reported incident:** Order **500046856**, **Heather Krause**, **2026-06-07**. Two **$383.41 CAD** "Successful / Purchase" Helcim transactions, **8 minutes apart** (5:19 PM and 5:27 PM), on **two different cards** (Visa …0239 then …0355), same cardholder, same batch (725).

---

## TL;DR

The Helcim integration is **charge-first, order-second**: the card is charged entirely client-side
inside the HelcimPay.js modal **before** any WooCommerce order exists. The only duplicate
protection in the codebase is keyed on the Helcim `transactionId`, which **only exists after a
charge succeeds** — so it can stop one charge from creating two orders, but it **cannot stop two
charges**. There is **no charge-level / cart-level guard anywhere**.

When order creation fails *after* a successful charge, the customer sees an error, reloads (which
wipes the in-memory "already paid" flag), and pays again. That is a real double charge. The
two-different-cards evidence in the incident is the signature of a **manual customer retry**, not a
backend replay.

---

## How the charge actually happens (the architecture trap)

```
Customer clicks "Complete Purchase"
        │
        ▼
HelcimCard.processPayment()  ──►  HelcimPay.js modal opens
        │
        ▼
Card is CHARGED here (money leaves the customer)   ◄── point of no return
        │  (Helcim "SUCCESS" postMessage event)
        ▼
HelcimCard.handlePaymentSuccess()
        │  ├─ POST /api/helcim-validate   (hash check)
        ▼
checkout/index.vue handleHelcimSuccess()  ──►  payNow()  ──►  processCheckout()
        │
        ▼
POST /api/create-admin-order   ◄── ORDER is created HERE, AFTER the charge
```

Key files:
- `components/shopElements/HelcimCard.vue` — owns the charge (modal, success/fail events).
- `pages/checkout/index.vue` — `handleHelcimSuccess` → `payNow` → `processCheckout`.
- `composables/useCheckout.ts` — `processCheckout` → `/api/create-admin-order`.
- `server/api/create-admin-order.post.ts` — creates the Woo order; **only** idempotency guard.

**The gap:** everything that can prevent a duplicate lives *downstream* of the charge. Nothing
sits *in front of* the charge to ask "did this cart already pay a minute ago?"

---

## Why the existing idempotency guard does not help

`server/api/create-admin-order.post.ts` (lines ~92–127) has an idempotency key:

```
idempotency:admin-order:${transactionId}
```

- `transactionId` is the **Helcim** transaction id, returned **after** a successful charge.
- A second charge (new modal session, or a different card) produces a **different**
  `transactionId` → a **different** idempotency key → **not blocked**.
- It only prevents *the same successful charge* from creating two orders. It is blind to *two
  separate charges*.

So the guard is correct for what it does, but it protects the wrong layer for this failure mode.

---

## Most likely sequence for the June 7 incident

1. **5:19 PM** — Customer pays with Visa …0239. HelcimPay.js returns SUCCESS. **Money is taken.**
2. `handleHelcimSuccess` → `payNow()` → `processCheckout()` → `/api/create-admin-order`.
3. **Order creation fails or appears to fail.** `create-admin-order` is slow and fragile:
   - a hard-coded `await sleep(4000)` (line ~575),
   - plus sequential WooCommerce REST calls with 30 s timeouts and exponential backoff,
   - all inside a Cloudflare Worker with wall-clock/CPU limits.
   A timeout, GraphQL error, or network blip here returns an error to the browser — **the charge
   already went through.** The customer sees "Order completion failed after payment" or a stuck
   "Processing Your Order" overlay.
4. **Customer assumes it failed and reloads.** A reload wipes the in-component
   `helcimPaymentComplete` flag — there is **no persistent "already charged" state** — so the
   checkout is a clean slate.
5. **5:27 PM** — Customer pays again, this time with Visa …0355 (a second card, because they think
   the first was the problem). **Second charge succeeds.** This time order creation works → order
   **500046856** is created, referencing only the second transaction.

Net result: two Helcim charges, (at most) one Woo order. Exactly what the dashboard shows.

### Why "two different cards" confirms a manual retry
A backend retry/replay would reuse the same card token. Two **different** PANs means a human
re-entered payment details — i.e., the customer was driven to retry by a failure they could see.

---

## Contributing weaknesses found in code review

| # | Weakness | File / lines | Effect |
|---|----------|--------------|--------|
| 1 | Charge-first/order-second with no pre-charge guard | architecture | Enables the whole class |
| 2 | Idempotency keyed on post-charge `transactionId` | `create-admin-order.post.ts` ~92 | Cannot stop a 2nd charge |
| 3 | No persistent "already charged" state across reloads | `HelcimCard.vue` (`paymentComplete` is in-memory) | Reload → clean retry |
| 4 | Fragile/slow order creation (4 s sleep + serial REST + retries under Worker limits) | `create-admin-order.post.ts` ~575, 610 | Makes step 3 of the incident likely |
| 5 | `props.amount` watcher re-initializes a brand-new chargeable session on any total change | `HelcimCard.vue` ~637 | Extra ways a 2nd payable session appears |
| 6 | `checkout-requested` is emitted but never handled by the parent | `HelcimCard.vue` ~555 / `checkout/index.vue` | "Complete Purchase" works only via native form submit — brittle |

(Related but distinct: the false "Card Declined" issue in
`docs/helcim-cc-rejection-critical-patch.md` — that is charges that **don't** go through being
mislabeled. Both share the same fragile retry UX.)

---

## What this PR ships (Phase 1 — safe, non-blocking)

A **persistent, charge-level duplicate-charge guard** that does **not** alter the happy path:

- `server/utils/helcimChargeGuard.ts` — fingerprints a charge by **email + amount + line items**;
  records successful charges in Cloudflare KV (`NUXT_CACHE`) with a 30-min TTL and a 20-min
  "warning window". All operations are best-effort and **fail open** (KV down → no warning, never
  an error).
- `server/api/helcim-validate.post.ts` — records the charge **at validation time**, i.e. right
  after the charge and **before** the Woo order exists. This is the critical detail: it captures
  the charge even when order creation later fails (the exact incident scenario).
- `server/api/helcim.post.ts` (`initialize`) — looks up the fingerprint and returns a
  `recentChargeWarning` flag when a matching charge happened in the last 20 minutes.
- `components/shopElements/HelcimCard.vue` — sends the charge context to validation and, when the
  warning flag is set, shows a **non-blocking yellow banner**: *"You may have already paid for this
  order — check your email before paying again."* The customer can still proceed (legitimate
  re-purchases exist, and this ships without live-checkout testing).

Why non-blocking: a hard block on the front end without the ability to run a live Helcim checkout
in this environment risks breaking real purchases. The warning would have prevented this incident
(the customer would have been told to check email after the first charge) while being safe to ship.

---

## Recommended follow-ups (Phases 2–3 — need live-checkout testing)

1. **Harden order creation so it stops failing after the charge** (attacks the root trigger):
   - Remove/shrink the hard-coded 4 s sleep in `create-admin-order.post.ts`.
   - Move the status→processing REST update to a non-blocking/queued step so the order is returned
     to the customer as soon as it is created.
   - Add a server-side **recovery**: if `create-admin-order` throws after a known-good
     `transactionId`, persist the full order payload to KV and reconcile/create it out-of-band
     (cron or webhook) so a charged customer always ends up with an order without retrying.
2. **Promote the warning to a soft/hard block** once tested: require an explicit "I understand,
   charge me again" confirmation when `recentChargeWarning` is set.
3. **Persist "already charged" client state** keyed to the cart/session so a reload restores the
   "payment already completed, finishing your order…" view instead of a fresh pay button.
4. **Server-authoritative charge** (larger change): create the charge intent server-side and tie
   the Woo order to it via a single idempotency key that exists *before* the money moves.

---

## Customer-service note for THIS incident

Heather Krause was charged **twice** ($383.41 on …0239 and …0355). Order **500046856** corresponds
to **one** of the two charges. **Refund the other charge** in the Helcim dashboard (the one with no
matching Woo order) and confirm only a single order ships.

## Related
- `docs/helcim-integration.md`
- `docs/helcim-cc-rejection-critical-patch.md`
- `server/api/create-admin-order.post.ts`, `server/api/helcim.post.ts`, `server/api/helcim-validate.post.ts`
- `server/utils/helcimChargeGuard.ts`, `components/shopElements/HelcimCard.vue`
