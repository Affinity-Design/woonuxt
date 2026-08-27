# FlavorCloud WooCommerce Plugin Research and Build Plan

Status: Research phase complete for implementation planning on 2026-08-27

Target: `proskatersplace.com` WordPress and WooCommerce storefront

Out of scope for this phase: writing the production plugin, creating labels, changing live shipping zones, or modifying the Canadian WooNuxt checkout

## Executive Decision

Build FlavorCloud as a standalone, project-owned WooCommerce plugin with its own shipping method ID, tentatively `psp_flavorcloud`. Do not add FlavorCloud logic to the theme, do not fork or impersonate WooCommerce Table Rate Shipping, and do not trigger it from every order that enters `processing`.

FlavorCloud currently lists Shopify and BigCommerce as native connectors; WooCommerce is handled through the REST API path for other platforms. The proposed plugin is therefore an API integration owned by ProSkaters Place, not a wrapper around a supported FlavorCloud WooCommerce extension.

The first production release should provide `.com` international DDP quotes, preserve the selected quote on the order, and support a controlled manual fulfillment handoff. Automated order push must wait until FlavorCloud provides a documented non-fulfilling order-ingestion contract.

The public FlavorCloud API has a critical mismatch with the operational workflow described on the technical call:

- FlavorCloud's public `POST /Shipments` endpoint creates labels, customs documents, and tracking. Its documentation describes the call as billable.
- The technical call described pushing a paid order into the portal first, then letting the warehouse pack it and click **Fulfill** later.
- No public `/Orders` or draft-order endpoint exists in the current OpenAPI specification.
- Manual CSV import is the only public candidate found for a portal handoff that does not call `/Shipments`, but the documentation does not define the result of leaving its rate/fulfill flags false or how the checkout quote hashes survive import.

Therefore, the plugin must not call `POST /Shipments` when an order changes to `processing` until FlavorCloud resolves the contract and billing questions in this document.

The second major constraint is storefront isolation. `proskatersplace.com` and `proskatersplace.ca` share WooCommerce infrastructure. Canada is an international destination for the `.com` store but is the domestic market for `.ca`, so destination country alone cannot separate the storefronts. Eligibility must combine storefront channel and destination:

> `.com` storefront AND destination outside the United States AND not a WooNuxt/`.ca` request or order

## Recommended Scope

### Version 1

- A dedicated `.com` international WooCommerce shipping method.
- FlavorCloud authentication and DDP rate retrieval.
- Standard and Express services when returned for the merchant account.
- HS code and manufacturing Country of Origin fields at product and variation level.
- A catalog-readiness report and CSV-compatible product-data workflow.
- Short-lived quote caching and duplicate-request protection.
- Safe coexistence with Table Rate Shipping, PSP Dynamic Table Rates, Price Based on Country, POS shipping, Code Snippets, ShipStation, and the `.ca` WooNuxt flow.
- Persistence of the selected provider quote and landed-cost components on the Woo order.
- A FlavorCloud-confirmed non-fulfilling handoff; manual CSV export is a candidate pending quote-preservation testing.
- HPOS support and classic checkout support.
- Checkout Blocks support only after the live checkout type and Store API behavior are verified.

### Deferred Until FlavorCloud Confirms the Contract

- Automated portal-order creation on `processing`.
- `POST /Shipments` label generation.
- Automated commercial invoice generation.
- Automatic tracking import, order completion, or customer notification.
- Webhooks, unless FlavorCloud documents authenticity and replay protection.
- DDU rates.
- Synchronous HS classification during checkout.

## Evidence and Confidence

This plan separates confirmed evidence from vendor statements and unresolved assumptions.

| Evidence type                         | What was reviewed                                                                                                                                                                  | Confidence and limitation                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FlavorCloud official documentation    | Developer Hub, merchant guide, OpenAPI, Rates, Landed Cost, Classification, Shipments, Tracking, Webhooks, and CSV import documentation                                            | High confidence for the published API shape; several operational details conflict or remain undocumented              |
| Current `woonuxt` repository          | `.com` WordPress snippets, `.ca` checkout, Helcim order creation, GraphQL request markers, shipping UI, and catalog artifacts at commit `5945ca10691aaacbf4b9a98b5b0585d796e46936` | High confidence for checked-in behavior; a snippet in Git is not proof that the same revision is active on production |
| Private `psp-theme` repository        | Read-only audit through existing workstation GitHub authorization at commit `257d5eeee235b96bec26e03d29f3bbc443bc6677`                                                             | High confidence for repository source; activation and production settings remain unverified                           |
| Public WooCommerce Store API snapshot | 1,719 published product records across 18 pages on 2026-08-27                                                                                                                      | Useful for parent-product weight and dimension readiness; private metadata and variation coverage are not exposed     |
| Technical call and email              | Merchant workflow, account access, pricing statements, and testing-rights statements                                                                                               | Treat as vendor guidance pending confirmation against the signed contract and a safe test account                     |
| Live WordPress administration         | Not completed                                                                                                                                                                      | Required before implementation sign-off                                                                               |

Credential material received with the request was deliberately not copied into this document, logs, source, or test commands. Any web-account password transmitted in the research request must now be treated as exposed: rotate it, revoke existing sessions if FlavorCloud supports that action, and create a separate least-privilege API credential set for the integration.

## Current System Audit

### 1. Table Rate Shipping

The private theme repository contains WooCommerce Table Rate Shipping version 3.6.1. It registers the shipping method ID `table_rate` and provides the `woocommerce_table_rate_get_shipping_rates` filter over its stored rate rows.

The new provider must register its own shipping method and must not write FlavorCloud quotes into the Table Rate Shipping database. Keeping the methods separate provides a stable compatibility boundary and allows Table Rate to remain a fallback.

Audited private paths at `psp-theme` commit `257d5eeee235b96bec26e03d29f3bbc443bc6677`:

- `third-party-plugins/woocommerce-table-rate-shipping/woocommerce-table-rate-shipping/woocommerce-table-rate-shipping.php`
- `third-party-plugins/woocommerce-table-rate-shipping/woocommerce-table-rate-shipping/includes/class-wc-table-rate-shipping.php`
- `third-party-plugins/woocommerce-table-rate-shipping/woocommerce-table-rate-shipping/includes/class-helpers.php`
- `third-party-plugins/woocommerce-table-rate-shipping/woocommerce-table-rate-shipping/includes/class-wc-shipping-table-rate.php`

### 2. WooCommerce Shipping-Zone Topology

WooCommerce assigns an address to the first matching shipping zone and shows methods from that zone only. A new FlavorCloud-only zone could therefore hide the intended Table Rate fallback even when the fallback exists in a later zone.

For every applicable matched international zone, configure `psp_flavorcloud` and its mapped legacy fallback in the same zone, or deliberately duplicate the approved fallback there. Audit zone ordering from the narrowest geography to the broadest, including Rest of World, before enabling the provider. The plugin's rate arbitration can hide the mapped fallback after a successful FlavorCloud quote, but it cannot recover a method from a different zone WooCommerce never evaluated.

### 3. PSP Dynamic Table Rates

The private repository also contains `psp-trs-dynamic-rates` version 1.0.2. It manages the free-shipping threshold for explicitly selected Table Rate rows, including Price Based on Country conversion. It hooks `woocommerce_table_rate_get_shipping_rates` and updates selected rows in the Table Rate custom database table.

It does not implement a general carrier/provider abstraction and does not mutate unrelated shipping method IDs. A separate `psp_flavorcloud` method should therefore remain outside its managed row set.

Audited private paths:

- `psp-trs-dynamic-rates/psp-trs-dynamic-rates.php`
- `psp-trs-dynamic-rates/includes/class-psp-trs-dynamic-rates.php`

Compatibility rule: never reuse `table_rate`, never inject ephemeral FlavorCloud quotes as Table Rate rows, and never ask PSP Dynamic Table Rates to calculate FlavorCloud costs.

The current dynamic plugin's free-shipping threshold will not automatically apply to the separate FlavorCloud method. That is the safe default unless the business explicitly approves subsidized international shipping. If a threshold must apply, preserve the undiscounted FlavorCloud liability and DDP components separately from the zero/reduced customer-facing rate, then test the subsidy in every pricing-zone currency.

### 4. Existing PSP Shipping and POS Snippets

The checked-in [master payment and shipping snippet](../psp-master-payment-shipping-code-snippets.php) filters `woocommerce_package_rates` at priority 10. It intentionally preserves normal `table_rate` methods and removes only methods or labels recognized as POS/local-store choices. A distinct, customer-facing FlavorCloud method should survive this filter as long as it avoids the reserved POS identifiers and phrases.

Reserved compatibility hazards include:

- Method types `flat_rate` and `local_pickup` when used by the staff/POS logic.
- Existing instance ID `8`.
- Labels containing `pos |`, `local store purchase`, `pos local`, `in-store purchase`, or `instore purchase`.
- A staff-only zero-cost POS rate added at priority 100.

The same file contains a legacy fixed-dollar US tariff fee. It is disabled by default and scoped to US destinations. FlavorCloud's DDP duty and tax values must remain entirely separate from that approximation.

### 5. Checkout Refresh Behavior

The checked-in [checkout rules snippet](../woocommerce-checkout-rules.php) clears the WooCommerce shipping session during checkout recalculation. Its browser script also requests another checkout update shortly after address fields change.

Without a plugin-owned cache, one shopper typing an address could cause multiple nearly identical FlavorCloud calls. The provider therefore needs:

- An address-completeness check before any external request.
- A short-lived quote cache independent of WooCommerce's shipping-session cache.
- An in-request lock or duplicate-request guard.
- A normalized request fingerprint containing storefront, destination, products, variations, quantities, customs data, package data, and currency.
- A short HTTP timeout and a deliberate fallback path.

The existing checkout code rejects PO boxes in both classic and Store API flows. FlavorCloud eligibility should run the same validation before requesting a quote so a rate is not shown for an address WooCommerce later refuses.

### 6. Price Based on Country and Multi-Currency

The private repository contains WooCommerce Price Based on Country version 4.1.1. When `wc_price_based_country_shipping_exchange_rate` is enabled, its priority-10 `woocommerce_package_rates` filter converts every non-zero shipping rate using the current pricing-zone exchange rate and recalculates rate taxes.

This creates a double-conversion hazard. FlavorCloud supports a requested ISO currency, but a rate already returned in the shopper's currency would be converted a second time by Price Based on Country unless the new plugin adds a tested compatibility adapter.

Two technically viable strategies require a live decision:

| Strategy                                                                                                                                       | Benefit                                                                       | Risk                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request FlavorCloud in the `.com` base/store currency, currently expected to be USD, then let Price Based on Country convert the Woo rate      | Matches the existing shipping-rate pipeline and avoids an undocumented bypass | Must prove that product prices, landed costs, quote hashes, checkout totals, and later fulfillment remain internally consistent when the Woo order uses another currency |
| Request FlavorCloud in the shopper's active currency and restore only `psp_flavorcloud` rates after Price Based on Country's conversion filter | Matches the technical-call requirement and the provider quote currency        | Requires a carefully tested plugin-specific compatibility adapter and must not affect other rates or taxes                                                               |

Do not choose solely from source inspection. First confirm the live option value, pricing zones, supported FlavorCloud account currencies, rate response behavior, and shipment hash requirements. The selected strategy must be verified in USD, CAD, and EUR.

### 7. `.ca` WooNuxt Isolation

The Canadian storefront is not an independent WooCommerce backend. It sends identifiable requests into the shared system:

- [Nuxt GraphQL configuration](../../nuxt.config.ts) and [the GraphQL header plugin](../../plugins/graphql-headers.ts) set `X-Frontend-Type: woonuxt`.
- Browser requests include the `.ca` origin/referrer.
- [The Canadian country selector](../../components/shopElements/CountrySelect.vue) is locked to Canada.
- [The checkout composable](../../composables/useCheckout.ts) records `.ca` source metadata.
- [The Helcim admin-order route](../../server/api/create-admin-order.post.ts) stores `_order_source` and `_customer_source = proskatersplace.ca` and deliberately advances paid Canadian orders to `processing`.

A generic `woocommerce_order_status_processing` callback would therefore export Canadian Helcim orders. Destination `CA` cannot be globally blocked because `.com` shipments to Canada are valid FlavorCloud candidates.

The plugin needs defense-in-depth at both quote and fulfillment time:

1. Resolve the storefront channel before calculating a rate.
2. Deny WooNuxt, GraphQL, `.ca` origin/referrer, and known `.ca` source contexts.
3. Allow `.com` classic checkout only when the destination is outside the United States.
4. For REST/Store API requests, require an explicit `.com` origin or another verified `.com` channel marker; do not assume every REST request is `.ca` or every request without a header is `.com`.
5. At fulfillment, require an order line whose method ID is exactly `psp_flavorcloud`.
6. Reject orders with `.ca` source metadata even if their status is `processing`.
7. Recheck the destination and selected quote metadata before any export.
8. Exclude POS/local-pickup orders.

### 8. Catalog Readiness

No product customs implementation was found in the current `woonuxt` source. The `woo-origin-sort` plugin is about order-attribution origin, not manufacturing Country of Origin, and must not be reused.

A public Store API snapshot on 2026-08-27 returned 1,719 published product records:

- 1 record had zero or missing parent-product weight.
- 24 records had complete non-zero parent-product length, width, and height.
- 1,695 records were missing at least one parent-product dimension.

This does not prove variation readiness and does not expose private HS/COO metadata. A privileged product-and-variation audit is still required before launch.

FlavorCloud's current rate guidance expects each customs line to have:

- Quantity.
- Weight.
- Sale price.
- Six-digit HS code.
- Two-letter manufacturing Country of Origin.
- Description.

SKU, material, category, product image, and item dimensions improve classification and customs quality. Package weight is required for rating. Package dimensions are optional for `/Rates` but required for `/Shipments`; account average-package settings are only a fallback.

### 9. Woo Packages and Customs Value

The live site may split a cart into more than one WooCommerce shipping package through shipping classes or custom filters. FlavorCloud's `/Rates` request describes one package, while later fulfillment may involve one or more cartons. Rating each Woo package independently could duplicate minimum charges, de minimis calculations, or duties; merging packages blindly could break existing Table Rate behavior.

Version 1 should support one verified Woo shipping package unless the live audit proves a safe multi-package mapping. A multi-package cart must use the approved fallback or a clear unavailable state rather than silently producing several unrelated FlavorCloud customs calculations.

Coupon allocation is also part of customs valuation. The plugin must not assume whether `Pieces[].SalePrice` is list price, sale price, or the post-discount transaction value. FlavorCloud must confirm how product-level and order-level discounts, taxes, gift cards, and zero-price promotional lines should be represented before the request builder is finalized.

### 10. ShipStation and Tracking Ownership

No current ShipStation integration source is checked into this repository. Existing artifacts show that orders have previously carried `_shipstation_exported`, and [the Canadian redirect snippet](../redirect-cad-traffic.php) exempts ShipStation/API/webhook requests, but the active tracking plugin and metadata contract are not confirmed.

Version 1 must not automatically complete orders or send tracking notifications. The fulfillment design must first identify whether ShipStation, YITH Order Tracking, WooCommerce, or another plugin owns tracking and customer emails so one shipment does not produce duplicate notices.

## FlavorCloud API Findings

### Authentication

- Production API base: `https://partnerapi.flavorcloud.com`.
- Authenticate server-side with `POST /Auth` using `AppID` and `RestApiKey`.
- The current OpenAPI security scheme says HTTP Bearer JWT, but the merchant guide's header table and examples say to send the returned token directly as the `Authorization` value. Do not hard-code either syntax until a safe sandbox call confirms the account's accepted form.
- The response includes `ExpiresIn`; cache according to the returned value with a safety margin and refresh once after a `401`.
- Documentation conflicts on the stated token lifetime, while an endpoint example returns 43,200 seconds. Do not hard-code nine or twelve hours.

### Rates

Use `POST /Rates` with `IncludeLandedCost: true`. The request includes reference, units, currency, ship-from address, destination, customs pieces, and package data.

The response can return Standard, Express, Standard Economy, and Express Economy groups, with DDP and/or DDU choices. A DDP rate contains:

- `RateId` and `HashKey`.
- Carrier and estimated days.
- Shipping-cost fields.
- `LandedCostDetail` containing duty, sales tax, AIT, landed-cost totals, and `DutyHashKey`.

The plugin parser must accept monetary fields returned as JSON numbers or numeric strings. It must persist the selected `HashKey` and `DutyHashKey` for later fulfillment.

The public documentation does not make the final amount to charge completely unambiguous for every account. The likely calculation is shipping plus the landed-cost total, but it must be confirmed with FlavorCloud and verified with known sandbox examples before customer charging is enabled.

### Classification

`POST /Classifications` accepts product descriptions and supporting fields and returns HS classifications and quality information. This is a catalog-management operation, not a checkout operation.

Do not classify synchronously inside `calculate_shipping()`. Classification latency or failure must never stall checkout. Use bulk background classification only after merchant review and store the approved result on the product or variation.

Published guidance conflicts on whether missing data may be dynamically classified for an account. Launch should require reviewed HS and COO values rather than depending on an account-specific automatic fallback.

### Shipments

`POST /Shipments` creates carrier labels, customs documents, and tracking. Shipment package dimensions are required. `Reference` must be unique; repeating it can retrieve the prior shipment instead of creating a new one, which is the only concrete public retry behavior.

The endpoint is not the draft-order contract described on the call. Do not call it on `processing` in version 1.

### CSV Import

FlavorCloud publicly documents manual CSV import. The template supports addresses, customs lines, package data, currency, service, and terms. It says `ImportAsRated=True` attempts to rate an import and `ImportAsFulfilled=True` attempts to rate and fulfill it. It lists `False` as an allowed value for both flags but does not explicitly promise what a false/false import becomes.

The public CSV fields also do not include `HashKey` or `DutyHashKey`. A CSV upload may therefore re-rate the order instead of preserving the DDP quote the customer paid. CSV is a candidate initial handoff, not an approved design, until FlavorCloud confirms the false/false state and demonstrates how the original quote, currency, duties, and price are preserved or reconciled.

The exact template sent by the FlavorCloud representative must be obtained and versioned as a schema fixture before coding the exporter.

### Tracking and Webhooks

FlavorCloud documents tracking lookup and the `SHIPMENT_CREATED` and `TRACKING_UPDATES` webhook events. Public documentation does not describe webhook HMAC/signature validation, secrets, retries, timeouts, ordering, or replay protection. It also contains old and new tracking routes, including a legacy form that places credentials in the URL.

Prefer the newer token-authenticated tracking route and confirm its header syntax in sandbox. Do not put credentials in URLs, and do not expose a public webhook endpoint until FlavorCloud documents how messages can be authenticated.

### Errors and Limits

Published endpoints document `400`, `401`, `404`, `422`, and `500` responses. Hash keys may expire or already have been used, requiring a fresh rate call. No formal public quota, concurrency limit, `429` behavior, retry header, or service-level timeout was found.

Use bounded retries only for safe, idempotent operations. Never retry a potentially billable shipment creation without resolving the prior request by its unique reference.

## Proposed Plugin Architecture

### Package Boundary

Suggested package name: `psp-flavorcloud-international-shipping`

Distribute it as a first-party plugin ZIP from a project-owned source directory or dedicated repository. Do not place runtime code in the WordPress theme, and do not copy licensed Table Rate Shipping or Price Based on Country implementation code. Compatibility should use WooCommerce hooks and small, documented adapters.

Suggested source structure:

```text
psp-flavorcloud-international-shipping/
├── psp-flavorcloud-international-shipping.php
├── src/
│   ├── Plugin.php
│   ├── Admin/
│   │   ├── SettingsPage.php
│   │   └── CatalogReadinessReport.php
│   ├── Api/
│   │   ├── FlavorCloudClient.php
│   │   ├── AuthTokenCache.php
│   │   └── FlavorCloudApiException.php
│   ├── Catalog/
│   │   ├── ProductCustomsFields.php
│   │   ├── ProductCustomsResolver.php
│   │   └── ClassificationJob.php
│   ├── Checkout/
│   │   ├── FlavorCloudShippingMethod.php
│   │   ├── StorefrontEligibility.php
│   │   ├── QuoteRequestBuilder.php
│   │   ├── QuoteResponseParser.php
│   │   ├── QuoteCache.php
│   │   ├── InternationalRateArbitrator.php
│   │   └── MultiCurrencyCompatibility.php
│   ├── Orders/
│   │   ├── SelectedQuoteMetadata.php
│   │   ├── FlavorCloudCsvExporter.php
│   │   └── FulfillmentEligibility.php
│   └── Support/
│       ├── RedactedLogger.php
│       └── RequestFingerprint.php
└── tests/
```

Names are intentionally explicit so provider, checkout, catalog, and fulfillment responsibilities do not collapse into one shipping class.

### Runtime Flow

```mermaid
flowchart TD
    A[WooCommerce requests package rates] --> B{Verified dot-com channel?}
    B -- No --> Z[Zero FlavorCloud API calls]
    B -- Yes --> C{Destination outside US?}
    C -- No --> Z
    C -- Yes --> D{Complete address and valid package?}
    D -- No --> F[Leave current rates unchanged]
    D -- Yes --> E{Every item has approved weight, HS code, COO, price, and description?}
    E -- No --> F
    E -- Yes --> G[Read or request cached DDP quote]
    G --> H{Valid FlavorCloud services returned?}
    H -- No --> I[Apply configured and accurately labelled fallback]
    H -- Yes --> J[Add psp_flavorcloud services]
    J --> K[Remove only competing legacy international table rates]
    K --> L[Customer selects one rate]
    L --> M[Persist quote components and safe identifiers on order]
    M --> N[Confirmed non-fulfilling handoff]
    N --> O[Warehouse packs and fulfills in FlavorCloud portal]
```

### Shipping Method Registration

- Extend `WC_Shipping_Method`.
- Method ID: `psp_flavorcloud`.
- Declare shipping-zone support.
- Add one Woo rate per returned, enabled DDP service using unique rate IDs.
- Start with Standard and Express; add Economy services only after account confirmation.
- Mark customer labels clearly as DDP, for example `International Standard — duties & taxes included`.
- Do not expose internal hash keys in customer-facing labels, emails, or order notes.
- Declare HPOS compatibility.
- Declare Checkout Blocks compatibility only after Store API tests pass.

### Storefront Eligibility

Create one `StorefrontEligibility` service used by quote calculation and fulfillment. It should return a structured reason, not just a boolean, so excluded calls can be diagnosed without logging customer addresses.

Expected outcomes:

| Context                                               | Destination             | FlavorCloud result                                                      |
| ----------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `.com` classic checkout                               | US                      | Disabled; existing domestic methods unchanged                           |
| `.com` classic checkout                               | Canada                  | Eligible as international                                               |
| `.com` classic checkout                               | Other supported country | Eligible as international                                               |
| `.ca` WooNuxt/GraphQL                                 | Canada                  | Disabled; zero provider calls                                           |
| `.ca` WooNuxt/GraphQL synthetic international request | Any                     | Disabled; zero provider calls                                           |
| Staff/POS/local-pickup order                          | Any                     | Disabled for fulfillment unless an explicit later policy says otherwise |
| Ambiguous programmatic request                        | Any                     | Disabled by default and logged only as a safe reason code               |

### Product Customs Resolution

Before defining new metadata keys, audit the live product editor, WooCommerce Shipping fields, imports, and existing metadata. If no canonical fields exist, provisional project-owned keys are:

- `_psp_flavorcloud_hs_code`
- `_psp_flavorcloud_origin_country`
- `_psp_flavorcloud_customs_description`
- `_psp_flavorcloud_material`

Resolution rules:

1. Variation-specific data wins.
2. Parent data may be inherited only when it is demonstrably valid for every variation.
3. Weight may use WooCommerce's resolved variation/product weight.
4. HS must be exactly six digits for the initial FlavorCloud contract.
5. COO must be an uppercase ISO 3166-1 alpha-2 manufacturing country, not the warehouse country.
6. Missing or invalid required data prevents a FlavorCloud request and appears in the admin readiness report.
7. Never silently invent an HS code or COO.
8. Support WooCommerce CSV import/export so classification work can be reviewed in bulk.

The readiness report should cover published simple products and every purchasable variation, not just parent products. It should filter by missing weight, missing HS, missing COO, missing customs description, and inherited values requiring review.

### Quote Request and Cache

Use one `/Rates` request with `IncludeLandedCost: true` after the address and cart are complete.

The request fingerprint should include at least:

- Storefront channel.
- Normalized country, state/province, postcode, and city.
- Product and variation IDs.
- SKU, quantity, weight, sale price, HS, COO, and description per line.
- Package weight and dimensions or selected package profile.
- Requested currency and pricing-zone identifier.
- Enabled service/terms configuration.
- Plugin request-schema version.

Cache successful responses for a short, configurable interval, initially five to ten minutes, but never longer than the provider's confirmed hash lifetime. Keep quote/hash caches scoped to the Woo customer session until FlavorCloud confirms whether hashes may be shared or reused; two shoppers must never receive the same potentially single-use quote token. Authentication tokens may be shared server-side. Do not cache authentication or validation errors for the full quote TTL. A changed address, quantity, variation, price, currency, customs field, coupon allocation, or package profile must produce a new fingerprint.

The current API schema requires contact fields such as name, phone, and email in addition to the destination. Send them only from the WordPress server, only after the shopper is eligible and the required checkout fields are present, and only for the rate purpose disclosed in the site's privacy notice. Confirm with FlavorCloud whether rate calls can use a reduced contact payload so checkout does not transmit unnecessary personal data.

The request builder must also define:

- The sale-price basis and proportional allocation for product- and order-level discounts.
- Whether prices exclude Woo tax and how zero-price lines are represented.
- The `ReasonForExport` value for retail sales.
- Insurance behavior.
- The authoritative ship-from/return address.
- One-package behavior and the safe outcome for a multi-package cart.

### Rate Cost and Tax Treatment

Do not hard-code a customer charge formula until FlavorCloud confirms it with account-specific examples.

The implementation needs fixtures proving whether the displayed DDP total is:

```text
ShippingCost + LandedCostDetail.LandedCost
```

and whether the six-percent platform fee described in sales correspondence is already represented, merchant-absorbed, or separately passed to the customer.

Once confirmed, store every component as provider metadata but add one atomic Woo shipping rate total. Avoid a separate mutable Woo fee that could become stale when the shopper changes service. The international rate should not cause WooCommerce to assess sales tax again on import duty or destination tax already included in DDP; the final `tax_status` requires verification against live Woo tax settings.

### Rate Arbitration and Fallback

Keep existing Table Rate methods configured during rollout.

After a valid FlavorCloud quote is added, a later `woocommerce_package_rates` filter should remove only the intended legacy international `table_rate` choices for customer checkout. It must preserve:

- `psp_flavorcloud` services.
- POS/local-store choices for authorized staff.
- Domestic `.com` choices.
- Unrelated pickup or provider methods not explicitly mapped as competitors.

Because the current PSP and Price Based on Country filters run at priority 10 and the staff POS rate is added at priority 100, a tentative arbitration priority around 50 is reasonable. Confirm the live hook order before locking that priority.

Failure policy is a business decision:

- **Fail open:** keep an accurately labelled legacy international Table Rate when FlavorCloud times out or rejects the cart. This protects conversion but may be DDU and must not be presented as duties-included.
- **Fail closed:** show no international rate and a clear retry/contact message. This protects DDP promises but can block sales.

Recommended launch posture: canary with a documented legacy fallback, provided its DDU/customer-duty implications are clearly labelled and approved. Never silently relabel a legacy rate as FlavorCloud DDP.

### Selected Quote Persistence

Persist safe, immutable quote facts on the selected order shipping item before payment/fulfillment logic depends on them:

- Provider and method ID.
- Rate ID, service code, service level, carrier, and estimated days.
- Provider currency and Woo order/display currency.
- Provider shipping cost.
- Duty, sales tax, AIT, and landed-cost total.
- Final Woo shipping-rate amount.
- DDP terms.
- `HashKey` and `DutyHashKey` as protected internal metadata.
- Request fingerprint and quote timestamp.
- Customs snapshot for each order line.

Do not depend on the shopper's PHP session after order creation. Do not store raw authorization tokens or entire provider responses on the order.

### Fulfillment Handoff

If FlavorCloud confirms CSV behavior and quote reconciliation, version 1 may expose an authenticated admin action to generate the exact FlavorCloud CSV schema for one order or a selected order batch. The exporter must:

- Require `manage_woocommerce` or an equivalent capability and a valid nonce.
- Require the exact `psp_flavorcloud` shipping method.
- Re-run `.ca`, destination, POS, quote, and customs eligibility checks.
- Use a stable, unique order reference.
- Use only the vendor-approved import flags; do not infer that false/false creates an unfulfilled order.
- Record only that an export was generated; it must not pretend the portal import succeeded.
- Avoid changing order status or sending customer email.
- Record the provider quote and any portal re-rate difference so warehouse staff cannot unknowingly fulfill above the amount collected from the customer.

If CSV cannot preserve or safely reconcile the paid checkout quote, it must not be the launch handoff. If FlavorCloud supplies a true draft-order endpoint, use that confirmed contract instead. Any asynchronous API handoff must use the same eligibility service, a stable idempotency/reference value, bounded retries, and an explicit terminal error visible to administrators.

### Tracking

Initial workflow:

1. Warehouse packs the order in FlavorCloud.
2. Warehouse confirms package dimensions.
3. Warehouse clicks **Fulfill** in the portal.
4. Warehouse copies tracking into the system that currently owns tracking.
5. The existing owner controls Woo order completion and customer notices.

Do not automate steps 4 or 5 until tracking ownership, notification behavior, and webhook authentication are confirmed.

## Settings and Security

Recommended settings:

- Enabled/dark mode.
- Environment label and API base URL allowlist.
- Eligible countries or exclusion set, with US always excluded for this `.com` method.
- DDP-only toggle fixed on for the initial release.
- Enabled service levels.
- International free-shipping/subsidy policy, disabled by default.
- Quote timeout and cache TTL.
- Failure policy.
- Currency strategy.
- Platform-fee policy.
- Ship-from origin and package-profile policy.
- Logging level.
- Fulfillment mode, initially disabled; allow `manual_csv` only after the CSV contract and reconciliation test pass.

Recommended secret constants:

- `PSP_FLAVORCLOUD_APP_ID`
- `PSP_FLAVORCLOUD_REST_API_KEY`

Secrets must remain server-side, preferably in environment configuration or `wp-config.php`, not committed source, frontend JavaScript, order metadata, logs, support exports, or URLs. The settings page should show only whether credentials are configured.

The web-account password supplied during discovery must be rotated before anyone begins implementation. API access must use a newly generated API credential set rather than the interactive portal password.

Cache the JWT in a server-side transient or object cache for less than the returned `ExpiresIn`. Redact authorization headers, full addresses, email, phone, raw API payloads, hash keys, and secrets from logs. Record safe diagnostic fields such as Woo order ID, request fingerprint prefix, FlavorCloud request ID, HTTP status, reason code, and latency.

Before launch, document FlavorCloud as an international shipping/customs service provider in the privacy notice, confirm the applicable data-processing terms and retention, and disclose that checkout contact, address, cart, and customs data are sent to FlavorCloud for eligible international quotes. Add WordPress personal-data exporter/eraser integration only for new plugin-owned personal data; ordinary Woo order retention remains governed by the existing store policy.

## Implementation Phases

### Phase 0: Contract and Live-Site Audit

Goal: remove assumptions that could charge customers incorrectly or affect `.ca`.

Tasks:

- Obtain FlavorCloud's exact non-fulfilling order-ingestion endpoint, or have FlavorCloud document and approve the CSV flags and quote-reconciliation behavior for the initial handoff.
- Obtain the exact CSV template sent by the implementation representative.
- Obtain a documented non-billable test workflow and safe test credentials/base URL.
- Rotate the web-account credential transmitted during discovery, revoke prior sessions where supported, and generate separate API credentials.
- Confirm whether the API expects raw-token or `Bearer` authorization syntax.
- Confirm the DDP charge formula, platform-fee treatment, supported currencies, service levels, hash lifetime, and billing event.
- Audit live active plugins, versions, Code Snippets, shipping zones, Table Rate rows, Price Based on Country options/zones, checkout type, HPOS, taxes, ShipStation, and tracking ownership.
- Audit every filter that creates or splits Woo shipping packages and decide the supported package count.
- Audit product and variation metadata for HS, COO, weight, dimensions, customs description, material, and SKU.
- Confirm whether `.com` international means every non-US destination supported by FlavorCloud, including Canada.
- Confirm the failure policy, staff/manual-order policy, and whether any free-shipping threshold subsidizes international rates.

Exit criteria:

- No unresolved billing or label-generation ambiguity.
- Live routing and currency behavior are documented.
- Canonical product metadata keys are chosen without duplicating an active plugin.
- A safe sandbox or vendor-approved test procedure exists.
- The target shipping-zone order and same-zone fallback topology are documented.

### Phase 1: Plugin Foundation and Catalog Readiness

Goal: create the provider boundary without enabling customer rates.

Tasks:

- Scaffold the standalone plugin with readable classes and namespaces.
- Declare HPOS compatibility.
- Add settings and environment-based credentials.
- Build authentication, defensive response parsing, safe logs, and an admin connection check.
- Add canonical product/variation customs fields or adapters to confirmed existing fields.
- Add product-customs fields to WooCommerce product CSV import/export and build the readiness report.
- Add bulk classification jobs only if FlavorCloud confirms the account workflow.
- Keep shipping method disabled/dark.

Exit criteria:

- No secrets appear in Git, HTML, logs, or metadata.
- Every purchasable SKU can be classified as ready or blocked with a clear reason.
- API authentication works in a non-billable environment.

### Phase 2: Dark-Mode Rate Engine

Goal: calculate and compare rates without showing them to customers.

Tasks:

- Implement storefront eligibility and prove zero calls for `.ca` and `.com` US requests.
- Build request mapping, response parsing, quote caching, and deduplication.
- Normalize numeric strings/numbers and capture provider request IDs.
- Implement the selected multi-currency strategy.
- Compare FlavorCloud quotes against expected portal examples in USD, CAD, and EUR.
- Reconcile coupon-adjusted customs values and the configured ship-from/package profile against provider fixtures.
- Log redacted comparison results visible only to administrators.
- Do not suppress Table Rate methods yet.

Exit criteria:

- Repeated checkout refreshes reuse the same valid quote.
- Quote components reconcile exactly to approved fixtures.
- No `.ca`, domestic US, incomplete-address, or incomplete-catalog request reaches FlavorCloud.
- Timeouts and malformed responses do not break checkout.

### Phase 3: Non-Customer Fulfillment Pilot

Goal: prove how a paid checkout quote reaches the portal before exposing rates to real customers.

Tasks:

- Implement a validated single-order candidate handoff using FlavorCloud's confirmed API or CSV contract.
- Include selected quote and order customs snapshots where the schema permits.
- Add export status and redacted validation errors to the Woo order admin.
- Run warehouse acceptance tests from a controlled test order through portal fulfillment and tracking entry.
- Prove whether `HashKey`, `DutyHashKey`, currency, shipping, duties, taxes, and total are preserved; if the portal re-rates, define and approve the reconciliation/variance policy.
- Verify that generating, voiding, and scanning test labels follows the signed billing rules.

Exit criteria:

- Warehouse can receive an order without an unintended label or charge, adjust the carton, and fulfill it manually.
- The checkout amount and final portal liability reconcile under the approved variance policy.
- No label is created by a Woo order-status transition.
- No duplicate tracking emails or incorrect order-status changes occur.

### Phase 4: Controlled Checkout Launch

Goal: offer DDP FlavorCloud services to a small `.com` international cohort only after the fulfillment pilot passes.

Tasks:

- Enable one approved country and currency first.
- Add customer-facing Standard/Express DDP rates.
- Persist selected quote components onto live canary orders.
- Suppress only mapped legacy international rates after provider success.
- Preserve the approved same-zone fallback after failure.
- Verify classic checkout and, if active, Checkout Blocks/Store API.
- Expand countries only after checkout-to-portal reconciliation.

Exit criteria:

- Woo totals, payment totals, order totals, provider quote, handoff, and portal liability reconcile.
- DDP wording and fallback wording are accurate.
- Domestic `.com`, `.ca`, POS, pickup, and staff behavior are unchanged.
- No customer or administrator can select a stale quote after changing address, cart, variation, or currency.

### Phase 5: Automated Draft-Order Push

Goal: automate handoff only if FlavorCloud supplies an appropriate endpoint.

Prerequisite: a written contract for an API operation that creates an unfulfilled portal order without label purchase.

Tasks:

- Queue export with Action Scheduler after payment/processing.
- Require the exact FlavorCloud method and reject `.ca`/POS orders.
- Persist a stable external reference and idempotency state before retrying.
- Add bounded retry and terminal-error administration.
- Reconcile provider order state without completing the Woo order.

Exit criteria:

- Repeated hooks and worker retries create one portal order.
- No labels, charges, fulfillment events, or customer notices occur before the warehouse acts.

### Phase 6: Optional Tracking Automation

Goal: automate tracking only after security and ownership are proven.

Tasks:

- Implement authenticated webhook verification or approved polling.
- Normalize documented payload casing differences.
- Make updates idempotent and replay-safe.
- Integrate with the confirmed tracking owner.
- Keep automatic Woo completion behind an explicit setting.

Exit criteria:

- Forged, replayed, duplicate, late, and out-of-order events are harmless.
- One shipment produces one tracking record and one intended customer notice.

## Required Test Matrix

### Storefront and Destination

- `.com` to US: no FlavorCloud API call; current domestic rate set unchanged.
- `.com` to Canada: FlavorCloud eligible; `.ca` logic does not intercept it.
- `.com` to UK, EU, Australia, Japan, and another approved country.
- `.com` to an unsupported or restricted country.
- `.ca` to Canada: no FlavorCloud call; CAD and Helcim flow unchanged.
- Synthetic `.ca` international package: no FlavorCloud call.
- Staff, phone order, POS, local pickup, and guest checkout.
- `.com` Stripe and PayPal completion with the selected FlavorCloud metadata preserved.

### Catalog

- Simple product with complete customs data.
- Variable product with variation-specific COO/HS/weight.
- Variation inheriting reviewed parent data.
- Missing weight, HS, COO, description, or price.
- Virtual/non-shippable product and mixed cart.
- More than 20 lines if `/LandedCost` is ever used.
- Package weight lower than summed line weight.
- Package dimensions missing at rate time and provided at fulfillment.
- One Woo shipping package and a deliberately split multi-package cart.

### Checkout Behavior

- Incomplete address and rapid address typing.
- State/postcode change after quote.
- Quantity, product, variation, coupon, and currency change after quote.
- Product-level discount, order coupon, gift card/credit, and zero-price promotional item.
- Multiple identical Woo recalculations within the cache TTL.
- FlavorCloud timeout, `401`, `400`, `422`, `500`, malformed JSON, missing DDP, and expired hash.
- Standard/Express availability changes.
- Table Rate fallback and FlavorCloud-success suppression.
- First-match shipping-zone ordering, same-zone fallback presence, and Rest of World behavior.
- PO box and invalid address.
- Classic checkout and Checkout Blocks if active.

### Currency and Totals

- USD, CAD, and EUR with Price Based on Country enabled.
- Price Based on Country shipping conversion enabled and disabled.
- Provider monetary fields as numbers and numeric strings.
- Zero-duty/de-minimis destination.
- Shipping, duty, sales tax, AIT, landed cost, platform fee, Woo shipping total, payment total, and order total reconciliation.
- Tax settings proving no double taxation of DDP components.
- Cart above and below any international subsidy threshold, preserving undiscounted provider liability.

### Fulfillment

- One CSV export/import.
- False/false CSV flag behavior and checkout-hash preservation, if CSV remains a candidate.
- Repeated export of the same order.
- Processing hook fired more than once.
- `.ca` Helcim order moved to `processing`.
- Manual fulfillment, label generation, commercial invoice, tracking entry, and completion.
- Label void/cancel and unscanned-label billing scenario.
- Duplicate notification and ShipStation interaction.

### Security and Operations

- Credentials absent from browser, source, logs, URLs, database exports, and support bundles.
- Administrator capability and nonce checks.
- Token expiry and single refresh after `401`.
- Redacted logs under API failure.
- Rate cache invalidation after product customs data changes.
- Concurrent requests and Action Scheduler retry behavior.
- Privacy disclosure, data minimization, retention, and personal-data export/erasure behavior.

## Rollback Plan

The release must remain reversible without deleting order evidence:

1. Disable the `psp_flavorcloud` method or global enable setting.
2. Leave the legacy international Table Rate configuration intact so the approved fallback becomes visible again.
3. Stop new background exports while allowing administrators to inspect existing export failures.
4. Preserve quote, customs, export, shipment, and tracking metadata already attached to orders.
5. Never delete or alter an external FlavorCloud order/label as part of plugin deactivation.
6. Provide a documented cache-clear action limited to FlavorCloud quotes and tokens.

Plugin uninstall should preserve order and product customs metadata by default. Any destructive cleanup must be a separate, explicit administrator action with an export/backup warning.

## Release Gates

Do not enable live customer rates until all of the following are true:

- FlavorCloud confirms the exact customer-charge formula and platform-fee treatment.
- A non-billable test procedure is available.
- Live Price Based on Country settings and the chosen currency strategy pass reconciliation.
- Product and variation readiness meets the agreed coverage threshold.
- `.ca` and `.com` US tests prove zero FlavorCloud calls.
- Existing domestic, international fallback, POS, and checkout snippets pass regression tests.
- FlavorCloud and its mapped fallback coexist in the actual first-matching international zones.
- The selected rate's hashes and customs snapshot survive into the Woo order.
- The warehouse handoff preserves or formally reconciles the paid quote before any real customer launch.

Do not enable automated order push until all of the following are true:

- FlavorCloud documents a non-fulfilling, non-label-generating ingestion API.
- Billing timing and cancellation are contractually clear.
- Idempotency and retry behavior are proven.
- ShipStation/tracking ownership is confirmed.
- Warehouse acceptance testing is complete.

## Blocking Questions for FlavorCloud

1. What API endpoint creates an unfulfilled portal order without generating or purchasing a label?
2. If no such endpoint exists, is CSV import with both `ImportAsRated` and `ImportAsFulfilled` false the approved WooCommerce workflow?
3. What are the sandbox base URL, test credentials, supported fixtures/countries, and guaranteed non-billable testing procedure?
4. When does billing occur: `/Shipments` request, portal fulfillment, label generation, carrier tender, first scan, or another event?
5. How are an unused label and a duplicate/ambiguous shipment request voided and credited?
6. What exact amount should WooCommerce charge for each DDP response? Is it always `ShippingCost + LandedCostDetail.LandedCost`?
7. Is the six-percent platform fee included in an API amount, billed to the merchant separately, or eligible to be passed through?
8. Which currencies and service groups are enabled for this merchant, and must `/Shipments` use the same currency as the rate hash?
9. What is the TTL and single-use behavior of `HashKey` and `DutyHashKey`?
10. What are the rate limits, concurrency limits, timeouts, retry guidance, and `429` behavior?
11. Is automatic product classification enabled and guaranteed for this account? What is the review/bulk-classification workflow?
12. How are webhooks authenticated? What are the signing algorithm, secret rotation, retry schedule, timeout, ordering, and replay rules?
13. Which newer token-authenticated tracking route is current, what header syntax does it require, and can the credential-in-URL legacy route be avoided entirely?
14. Does the portal's average-package configuration affect `/Rates` when package dimensions are omitted from the API request?
15. Does FlavorCloud offer address validation, or should the WooCommerce plugin integrate another validator?
16. May rate hashes be reused or shared, or are they single-use and customer/session-specific?
17. What exact `Pieces[].SalePrice` should be sent after product coupons, order discounts, gift cards, tax, and zero-price promotions?
18. Which personal/contact fields are truly required for `/Rates`, and may the quote request omit or minimize name, phone, and email?
19. How should one Woo cart with multiple shipping packages or cartons be rated without duplicating duties or de minimis calculations?
20. Must account billing/payment details be completed before rates are returned, and how does that interact with the instructed testing setup?
21. Should `Authorization` contain the raw token as shown in the merchant guide or `Bearer <Token>` as defined by the OpenAPI security scheme?
22. What portal state results when both CSV import flags are false, and is that state guaranteed not to rate, fulfill, generate a label, or incur a charge?
23. How can CSV or another draft handoff preserve the checkout `HashKey`, `DutyHashKey`, currency, shipping price, and DDP landed cost when those hashes are absent from the public CSV schema?
24. Should `.com` international shipping ever be free/subsidized at a cart threshold? If yes, which amount remains payable to FlavorCloud and how should the subsidy be represented?

## Live WordPress Audit Still Required

Before implementation, capture and attach a sanitized configuration report containing:

- WordPress, WooCommerce, PHP, and HPOS versions/status.
- Active shipping, currency, checkout, tax, tracking, and Code Snippets plugins/versions.
- Active shipping zones, method instance IDs, Table Rate rows, and rate labels.
- Exact first-match zone order and confirmation that every FlavorCloud zone contains its approved fallback.
- Shipping-class rules and filters that split or merge Woo shipping packages.
- Active Code Snippets that use shipping, checkout, order-status, payment, or tracking hooks.
- Price Based on Country zones, exchange rates, and `wc_price_based_country_shipping_exchange_rate` value.
- Classic vs Checkout Blocks status.
- Woo tax settings applicable to international shipping.
- Product and variation customs-meta keys and coverage counts.
- Store origin/return address, package profiles, insurance policy, and coupon/customs-value rules.
- ShipStation/YITH/other tracking plugin status and metadata ownership.
- A test order through each `.com`, `.ca`, POS, and international path.

The Affinity agency MCP matched the client name **ProSkaters Place**, but its selected record did not return a domain. Client confirmation was requested before further client-scoped operations, so no privileged live WordPress reads were made during this pass. Public REST evidence and repository source were used instead. This live audit is an implementation gate, not a reason to weaken the isolation rules.

## Recommended First Build Ticket

After Phase 0 is closed, the first engineering ticket should be limited to:

> Scaffold `psp-flavorcloud-international-shipping`; implement settings, environment-only credentials, HPOS declaration, redacted logging, authentication/token caching, storefront eligibility, product/variation customs resolution, and a catalog-readiness report. Keep the shipping method disabled and do not call `/Rates`, `/Shipments`, or change live shipping zones.

This produces a reviewable foundation without exposing customers, purchasing labels, or affecting `.ca`.

## Sources

### FlavorCloud

- [Developer Hub](https://flavorcloud.com/developer-hub)
- [OpenAPI 3.1 specification](https://partnerapi.flavorcloud.com/openapi.json)
- [Getting Started Guide for Merchants](https://docs.flavorcloud.com/)
- [Get Auth Token](https://docs.flavorcloud.com/api-16353083)
- [Get Rates](https://docs.flavorcloud.com/api-9095496)
- [Get Landed Cost](https://docs.flavorcloud.com/api-9095489)
- [Get Classification](https://docs.flavorcloud.com/api-9095483)
- [Create Shipments](https://docs.flavorcloud.com/api-9095482)
- [Subscribe Webhooks](https://docs.flavorcloud.com/api-9095498)
- [Get Tracking Detail](https://docs.flavorcloud.com/api-9095497)
- [Manual CSV order import](https://flavorcloud.com/resources/knowledge-base/manually-importing-orders-into-the-flavorcloud-app)
- [Managing Your Checkout](https://flavorcloud.com/resources/knowledge-base/managing-your-checkout)
- [Managing Your Products](https://flavorcloud.com/knowledge-base/how-to-setup-your-products-for-international-shipping/)
- [Country of Origin guidance](https://flavorcloud.com/knowledge-base/updating-country-of-origin-in-the-flavorcloud-product-grid/)
- [Product and package weight guidance](https://flavorcloud.com/knowledge-base/updating-product-weights-for-accurate-shipping-with-flavorcloud)

### WooCommerce and WordPress

- [WooCommerce Shipping Method API](https://developer.woocommerce.com/docs/features/shipping/shipping-method-api)
- [WooCommerce shipping zones](https://woocommerce.com/document/setting-up-shipping-zones/)
- [WooCommerce HPOS compatibility recipe](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/)
- [WooCommerce Cart and Checkout Blocks extension FAQ](https://developer.woocommerce.com/2023/11/06/faq-extending-cart-and-checkout-blocks/)
- [WooCommerce Settings API](https://developer.woocommerce.com/docs/extensions/settings-and-config/)
- [WooCommerce extension GDPR guidance](https://developer.woocommerce.com/docs/extensions/best-practices-extensions/gdpr-compliance)
- [WordPress HTTP API](https://developer.wordpress.org/plugins/http-api/)
- [Action Scheduler API](https://actionscheduler.org/api/)

### Repository Evidence

- [`woonuxt` audited commit](https://github.com/Affinity-Design/woonuxt/tree/5945ca10691aaacbf4b9a98b5b0585d796e46936)
- [`psp-theme` audited commit](https://github.com/Affinity-Design/psp-theme/tree/257d5eeee235b96bec26e03d29f3bbc443bc6677) (private repository)
- [Public WooCommerce Store API products](https://proskatersplace.com/wp-json/wc/store/v1/products?per_page=100&page=1)
