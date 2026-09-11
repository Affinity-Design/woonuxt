# Contract: WPGraphQL schema extension

**Branch**: `feature/conditional-upsell-coupons` | **Date**: 2026-09-10

Registered by `includes/class-psp-upsell-graphql.php` on `graphql_register_types` (priority 20), guarded per research RQ-14. Types are prefixed `Upsell` to avoid collisions with WooGraphQL. Field resolvers read the session state written by `PSP_Upsell_Engine::sync()`; the `Cart.upsell` resolver calls `sync()` first so the query alone is enough to auto-apply/remove coupons.

## SDL

```graphql
enum UpsellChannelEnum { CA COM }
enum UpsellOfferStateEnum { INACTIVE PENDING APPLIED DISMISSED }
enum UpsellNoticeKindEnum { PENDING APPLIED }
enum UpsellSideEnum { TRIGGER TARGET }

type UpsellTerm { databaseId: Int!, slug: String!, name: String! }

type UpsellSelector {
  taxonomy: String!            # product_cat | pa_manufacturer | pwb-brand
  termIds: [Int!]!             # expanded match set
  terms: [UpsellTerm!]!        # admin-picked terms (labels/links)
}

type UpsellDiscount { type: String!, amount: Float!, display: String! }   # "20%"

type UpsellNotices {
  productTrigger: String, productTarget: String,
  cartPending: String, cartApplied: String, checkout: String, couponLabel: String
}

type UpsellRule {
  databaseId: Int!
  name: String!
  priority: Int!
  hash: String!
  channels: [UpsellChannelEnum!]!
  triggerSelectors: [UpsellSelector!]!
  triggerLabel: String!
  triggerMinQty: Int!
  targetSelectors: [UpsellSelector!]!
  targetMatch: String!         # all | any
  targetLabel: String!
  excludeTriggerItems: Boolean!
  discount: UpsellDiscount!
  notices(locale: String = "en"): UpsellNotices!      # falls back to en
  ctaTriggerSide(channel: UpsellChannelEnum = CA): String!
  ctaTargetSide(channel: UpsellChannelEnum = CA): String!
}

type UpsellProductOffer {
  rule: UpsellRule!
  side: UpsellSideEnum!
  text(locale: String = "en"): String!     # notice with placeholders substituted
  ctaPath(channel: UpsellChannelEnum = CA): String!
}

type ProductUpsellState {
  hasUpsellTrigger: Boolean!               # product is a trigger for ≥1 active rule
  isUpsellTarget: Boolean!
  offers: [UpsellProductOffer!]!
}

type UpsellEligibleOffer { ruleId: Int!, state: UpsellOfferStateEnum!, label: String!, couponCode: String }
type UpsellCartNotice   { ruleId: Int!, kind: UpsellNoticeKindEnum!, text: String!, ctaPath: String }
type UpsellMissingQualifier { ruleId: Int!, label: String!, ctaPath: String! }
type UpsellLineItemDiscount { cartItemKey: String!, ruleId: Int!, couponCode: String!, amount: String!, label: String! }

type CartUpsellState {
  channel: UpsellChannelEnum!
  rulesVersion: String!
  eligibleOffers: [UpsellEligibleOffer!]!
  appliedAutoCoupons: [String!]!
  cartNotices(locale: String = "en"): [UpsellCartNotice!]!
  missingQualifiers: [UpsellMissingQualifier!]!
  lineItemDiscounts: [UpsellLineItemDiscount!]!     # UPSELL-* coupons only
  validatedCoupons: [String!]!                      # applied UPSELL-* codes that pass is_valid right now
}

extend type Cart    { upsell: CartUpsellState! }
extend type Product { upsell(channel: UpsellChannelEnum = CA): ProductUpsellState! }   # on the Product interface
extend type RootQuery { upsellRules(channel: UpsellChannelEnum = CA): [UpsellRule!]! }
```

Notes
- `Product.upsell` is registered on the `Product` **interface** so `SimpleProduct`/`VariableProduct` inherit it; the resolver uses the parent id for variations.
- `amount` fields are raw store-currency strings (no formatting) — the .ca formats with `formatPrice()`.
- No mutations: applying/removing is automatic. Shoppers remove an auto-coupon with the existing `removeCoupons` mutation, which sets the `dismissed` marker.
- Never surface rule failures as GraphQL errors (the error sanitizer masks anything containing "coupon"); surface them as `state`.

## .ca consumption

**Implemented as a server-side raw fetch, not a codegen operation.** `server/api/upsell/cart.post.ts` sends the query below to WPGraphQL with the shopper's forwarded `woocommerce-session` header (the `adminAuth.ts` pattern) and returns `null` when the field is absent. This keeps `nuxt build` independent of the plugin being deployed on the build's `GQL_HOST` and survives the WooGraphQL schema flap. No file under `queries/` is needed; the shapes below document the query it sends.

```graphql
# sent by server/api/upsell/cart.post.ts
query WooNuxtCartUpsell($locale: String) {
  cart {
    upsell {
      channel
      rulesVersion
      eligibleOffers { ruleId state label couponCode }
      appliedAutoCoupons
      cartNotices(locale: $locale) { ruleId kind text ctaPath }
      missingQualifiers { ruleId label ctaPath }
      lineItemDiscounts { cartItemKey ruleId couponCode amount label }
      validatedCoupons
    }
  }
}
```

```graphql
# reference only — the .ca reads rules through REST /api/upsell/rules; other consumers may use:
query upsellRules($channel: UpsellChannelEnum = CA, $locale: String = "en") {
  upsellRules(channel: $channel) {
    databaseId name priority hash channels
    triggerSelectors { taxonomy termIds terms { databaseId slug name } }
    triggerLabel triggerMinQty
    targetSelectors { taxonomy termIds terms { databaseId slug name } }
    targetMatch targetLabel excludeTriggerItems
    discount { type amount display }
    notices(locale: $locale) { productTrigger productTarget cartPending cartApplied checkout couponLabel }
    ctaTriggerSide(channel: $channel) ctaTargetSide(channel: $channel)
  }
}
```

Build note: the schema is introspected remotely at build time from `GQL_HOST` (`nuxt.config.ts:86-99`). Because the .ca never adds a codegen operation for these fields, the build does not depend on the plugin being deployed; if a future `.gql` operation is added, the plugin must be active on the build's backend first or codegen fails.
