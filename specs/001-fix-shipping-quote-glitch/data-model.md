# Data Model: Fix Shipping Quote Glitch

**Branch**: `001-fix-shipping-quote-glitch` | **Date**: 2026-03-26

## Entities

### ShippingAddress (validation target)

The set of fields that determines shipping quote eligibility. Not a new data structure — these fields already exist in `customer.value.billing` and `customer.value.shipping`.

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `address1` | `string` | Yes | `customer.billing.address1` or `customer.shipping.address1` |
| `city` | `string` | Yes | `customer.billing.city` or `customer.shipping.city` |
| `state` | `string` | Yes | `customer.billing.state` or `customer.shipping.state` |
| `country` | `string` | Yes | `customer.billing.country` or `customer.shipping.country` |
| `postcode` | `string` | Yes | `customer.billing.postcode` or `customer.shipping.postcode` |

**Validation rule**: ALL five fields must be non-empty strings (after trimming) for the address to be considered complete. Validation applies to the *active* shipping address:
- Default: `customer.value.billing`
- When `orderInput.value.shipToDifferentAddress === true`: `customer.value.shipping`

### Cart (existing — no structural changes)

The existing `Cart` type from WPGraphQL. No schema changes needed. Relevant fields for this feature:

| Field | Type | Behavior Change |
|-------|------|-----------------|
| `shippingTotal` | `string` | Display suppressed when address incomplete |
| `chosenShippingMethods` | `string[]` | Display suppressed when address incomplete |
| `availableShippingMethods` | `ShippingMethod[]` | Display suppressed when address incomplete |
| `total` | `string` | Displayed without shipping component when address incomplete |
| `rawTotal` | `string` | Used for arithmetic subtraction of shipping |

### OrderInput (existing — no structural changes)

| Field | Type | Behavior Change |
|-------|------|-----------------|
| `shipToDifferentAddress` | `boolean` | Determines which address object to validate |

## State Transitions

### Shipping Display State Machine

```
┌──────────────────┐
│  NO_ADDRESS       │  ← Initial state (all surfaces)
│  Shipping hidden  │
│  Cart: subtotal   │
│  Checkout: prompt │
└───────┬──────────┘
        │ All 5 address fields populated
        ▼
┌──────────────────┐
│  LOADING          │  ← updateShippingLocation() in progress
│  Spinner shown    │
│  No rates visible │
└───────┬──────────┘
        │ Cart refreshed with rates
        ▼
┌──────────────────┐
│  RATES_AVAILABLE  │  ← Shipping methods displayed
│  Methods visible  │
│  User selects one │
└───────┬──────────┘
        │ Any required field cleared
        ▼
┌──────────────────┐
│  NO_ADDRESS       │  ← Back to initial state
│  Stale rates      │
│  cleared/hidden   │
└──────────────────┘
```

**Transition rules:**
- NO_ADDRESS → LOADING: Only when `isShippingAddressComplete()` returns `true` AND `updateShippingLocation()` is called
- LOADING → RATES_AVAILABLE: When `isUpdatingCart` becomes `false` after a cart refresh
- RATES_AVAILABLE → NO_ADDRESS: When any required address field is emptied (via `isShippingAddressComplete()` returning `false`)
- Any state → NO_ADDRESS: On page load if address is incomplete (including stale backend cache)

## Relationships

```
customer.billing ─────┐
                       ├──► isShippingAddressComplete() ──► Display gates
customer.shipping ─────┘        │
                                │
orderInput.shipToDifferentAddress ──► selects which address to validate
                                │
                                ▼
                    updateShippingLocation() ──► GqlUpdateCustomer ──► refreshCart()
                                                                           │
                                                                           ▼
                                                                     cart state updated
                                                                           │
                                                    ┌──────────────────────┼──────────────────────┐
                                                    ▼                      ▼                      ▼
                                              Cart.vue              OrderSummary.vue        checkout.vue
                                              (subtotal only)       (conditional shipping)  (conditional methods)
```

## New Function Signature

```typescript
/**
 * Check if the active shipping address has all required fields populated.
 * Uses billing address by default; uses shipping address when
 * orderInput.shipToDifferentAddress is true.
 *
 * @returns boolean — true if all 5 fields are non-empty
 */
function isShippingAddressComplete(): boolean
```

This function will be exposed from `useCheckout()` as a computed ref for reactive use in templates.
