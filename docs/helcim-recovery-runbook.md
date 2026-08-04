# Helcim Stranded-Charge Recovery Runbook

**Use this when:** a customer's card was charged by Helcim but the WooCommerce order was never created (or the customer never saw confirmation it was) — e.g. a `create-admin-order` failure, a lost network response, or the deliberate test-failure procedure below. See `docs/checkout-failure-mitigation-plan.md` for the full background on why this exists.

**Sites:**

- Test: `https://test.proskatersplace.ca`
- Production: `https://proskatersplace.ca`

**You will need:** `REVALIDATION_SECRET` (lives in `.env`, gitignored — never paste the actual value into a committed file, chat, or this doc). Load it into a local variable instead of typing it inline each time:

```powershell
$secret = (Get-Content .env | Where-Object { $_ -match '^REVALIDATION_SECRET=' }) -replace '^REVALIDATION_SECRET=', ''
$site = "https://test.proskatersplace.ca"   # swap to the prod URL above when working against prod
```

Run that once per PowerShell session, then the commands below just reference `$secret`/`$site`.

---

## 0. (Optional) Deliberately force a test failure

**Test environment only — never do this on production.**

1. Cloudflare Pages → the **test** project → Settings → Environment variables.
2. Temporarily blank or typo `WP_ADMIN_APP_PASSWORD`.
3. Redeploy so the change takes effect.
4. Place one real order through checkout (real card, real charge — the charge happens client-side in Helcim before this credential is ever checked, so it will succeed regardless).
5. Order creation will fail immediately and deterministically — you should see the hard "Your payment went through — do not pay again" notice on the checkout page.
6. **Restore the correct `WP_ADMIN_APP_PASSWORD` and redeploy before continuing** — steps 2+ below need real WordPress access to work.

---

## 1. View the failure ledger

Browser-friendly (GET request) — paste directly into a browser tab, or run:

```powershell
Invoke-RestMethod -Uri "$site/api/checkout-failures?secret=$secret"
```

Useful filters (append with `&`):

- `&stage=order_create_failed` — just order-creation failures (the scenario above)
- `&stage=duplicate_charge_detected` — a second charge landed on an already-completed attempt
- `&email=customer@example.com` — filter to one customer
- `&since=2026-07-17T00:00:00Z` — only failures after a given time
- `&limit=500` — raise the default 100-row cap

The response includes `d1Bound` (true once the `woonuxt-checkout-logs` D1 database is bound — the code also accepts the legacy variable name `NUXT_CHECKOUT_LOGS`; see `docs/checkout-failure-mitigation-plan.md` §6) and a `failures` array. Grab the `transactionId` of the entry you want to recover.

---

## 2. Recover the stranded charge

`recover-helcim-order` is **POST-only** — a browser URL won't work here.

**Simplest: recover everything currently pending** (fine when you only have one test charge outstanding):

```powershell
Invoke-RestMethod -Uri "$site/api/recover-helcim-order" -Method Post -ContentType "application/json" -Body (@{ action = "recover-all"; secret = $secret } | ConvertTo-Json)
```

**Or list pending charges first, then recover one specifically:**

```powershell
# List — shows each pending charge's transactionId, email, cartTotal, failureReason
Invoke-RestMethod -Uri "$site/api/recover-helcim-order" -Method Post -ContentType "application/json" -Body (@{ action = "list"; secret = $secret } | ConvertTo-Json)

# Recover one by id — this is the same call the customer-facing "retrieve my order" button
# makes, so it does NOT require the secret (it's gated on knowing a real transactionId instead).
Invoke-RestMethod -Uri "$site/api/recover-helcim-order" -Method Post -ContentType "application/json" -Body (@{ transactionId = "PASTE_TRANSACTION_ID" } | ConvertTo-Json)
```

**Reading the response:**

- `recovered: true` + an `order` object (`databaseId`, `orderKey`, `orderNumber`) → success. The charge is now a real WooCommerce order; no second charge was made.
- `recovered: false, reason: "verification_failed", needsManualReview: true` → it couldn't confirm an order doesn't already exist (WordPress unreachable) and deliberately refused to auto-create one, to avoid a duplicate. Fix WordPress access and retry.
- `recovered: false, reason: "no_recoverable_charge"` → no stranded-charge record exists for that transactionId (nothing to do, or already cleaned up).

---

## 3. Verify

Re-run the ledger check from step 1. A new entry should appear at `stage: "recovery_attempt"` with a `reason` of `recovered_via_recreated` (new order created) or `recovered_via_existing_woo_order` / `recovered_via_idempotency` (an order already existed and was adopted instead).

---

## 4. Clean up (if this was a deliberate test)

- [ ] Confirm `WP_ADMIN_APP_PASSWORD` is restored correctly (if you ran step 0).
- [ ] Void the Helcim charge in the Helcim dashboard (same-day void, not a post-settlement refund, to avoid keeping the processing fee — confirm current behavior with Helcim if unsure).
- [ ] Cancel or delete the resulting WooCommerce order so it doesn't skew sales/inventory numbers.

---

## Running this with Claude directly

In a Claude Code session on this repo, you can just ask in plain language instead of running the commands yourself, e.g.:

- "Check the test site for any stranded charges"
- "Recover everything pending on test"
- "Recover transaction `<id>` on prod"

Claude has Bash/PowerShell tool access and can run the exact commands above — point it at this file (`docs/helcim-recovery-runbook.md`) if it's a fresh session. Since `recover-all`/single-recovery can create real WooCommerce orders, Claude should confirm with you before running anything against **production** — that's expected, not a bug.
