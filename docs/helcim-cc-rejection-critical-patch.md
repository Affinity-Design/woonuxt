# CRITICAL PATCH — Helcim "Card Declined" false errors (no backend trace)

**Status:** Phase 1 shipped · Phases 2–3 pending
**Owner:** Eng · **Opened:** 2026-06-18
**Severity:** High — blocks real checkouts, scares customers into thinking their card failed, leaves zero diagnostic trail.

---

## Problem

Customers intermittently see a red **"Card Declined"** message at Helcim checkout. Investigation proved these are **NOT real card declines**:

- A reported case (Walter Chan, $118.40 CAD, coupon `CANADADAY10`) left **zero records** in **both** Helcim and WooCommerce.
- The same day (2026-06-17) had **14 successful** Helcim transactions → not an outage, not a dead token.
- Genuine declines **do** get logged in Helcim (examples May 18–Jun 7 2026). These didn't → they never reached the card network.

**Root mechanism:** Helcim returns the raw error `"Could not complete CC transaction"` — a *pre-authorization rejection* (invoice/amount validation), not a bank decline. Our frontend (`components/shopElements/HelcimCard.vue`) mislabels it as "Card Declined." Because the charge is rejected before any record is created, **nothing is logged in Helcim or Woo**, so we have been flying blind.

**Prime suspect:** the coupon/discount → Helcim invoice reconciliation in `server/api/helcim.post.ts`. Woo taxes the **post-discount** subtotal (Walter: `(97.99 − 9.80) × 14.975% QC = 13.21`), but we send Helcim the **pre-discount** line items + a separate discount + the post-discount tax. If Helcim's internal invoice total diverges from the charge amount, it rejects. It's order-specific (coupon is the likeliest differentiator vs. the 14 successes).

**Audit constraint:** Helcim has a Card Transaction API (`GET https://api.helcim.com/v2/card-transactions/`) but **no CLI**, and the production token is IP-locked + scope-limited (returns `401 {"errors":"No access permission"}` off-network). Dashboard path for missing logs: **All Tools → Reporting → Status=Declined / Entry Point=HelcimPay.js**, and **API Logs / Error Logs** (request-level rejections never become transactions).

---

## Phases

### Phase 1 — Stop the harm + make it visible (SHIPPED)
- **Reclassify** `"Could not complete CC transaction"` as a processing error, NOT a card decline. New honest copy: *"We couldn't process this payment and your card was not charged…"* + show the "Copy error details" support button for this case. (`HelcimCard.vue`)
- **Instrument the blind spot:** generate a `traceId` per initialize, log the full outbound invoice payload + reconciliation with that id (`helcim.post.ts`), and on failure fire a beacon (`/api/helcim-log`) carrying the raw Helcim error + order context (coupon, discount, amount) so it is captured server-side (visible in `wrangler tail`) and persisted to KV for failures.
- Genuine bank declines (keyword-matched: DECLINED, insufficient funds, etc.) still show "Card Declined" — that wording is correct for those.

### Phase 2 — Confirm the cause (PENDING)
- Reproduce a checkout of the same product with `CANADADAY10` on a Quebec address, **with and without** the coupon.
- Read the Phase 1 `traceId` logs (`wrangler ... tail --search "Helcim"`) to compare the invoice total we send vs. the charge amount.
- Confirm whether any of the 14 successful 2026-06-17 transactions used a coupon (none → coupon strongly implicated).

### Phase 3 — Fix the root cause (PENDING, after Phase 2 confirms)
- **Preferred:** stop sending Helcim the itemized invoice with a separate discount line; send only the single charge `amount` (the itemized invoice is a "backup," not required to take payment). Eliminates the entire amount-mismatch failure class.
- **Alternative:** make the invoice reconciliation match Helcim's math (apply discount to line items pre-tax so `lineItems + tax + shipping == amount`).
- Decide once Phase 2 data is in.

### Phase 4 — Verify & close (PENDING)
- Live test checkout with coupon succeeds; verify on product page, cart, checkout summary (per CLAUDE.md pricing rule).
- Confirm a success record appears in Helcim + a Woo order is created.
- Remove temporary instrumentation if noisy, or downgrade to error-only.

---

## Customer service guidance

These failures mean: **card was NOT charged, NOT declined by the bank, no pending hold, no duplicate risk.** Recover the sale by placing the order manually with the discount, or have the customer retry without the coupon. **Do not tell customers to contact their bank.** See the CS email/script that accompanies this patch.

## Related
- Memory: `helcim-cc-rejection-not-decline`
- `docs/helcim-integration.md`, `server/api/helcim.post.ts`, `components/shopElements/HelcimCard.vue`
