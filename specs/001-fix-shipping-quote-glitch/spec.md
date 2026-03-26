# Feature Specification: Fix Shipping Quote Glitch

**Feature Branch**: `001-fix-shipping-quote-glitch`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "Fix a resurfaced shipping quote glitch — shipping rates, methods, and charges must not appear or affect totals until the shopper has entered a valid shipping address."

## Clarifications

### Session 2026-03-26

- Q: What minimum address fields must be present before shipping quotes are requested? → A: All address fields complete (full address including street)
- Q: Should the fix suppress frontend display regardless of backend data, or also clear backend shipping state? → A: Frontend-only suppression — hide/ignore backend shipping data when address is incomplete
- Q: What should the shipping section display while quotes are being calculated after address entry? → A: Show a spinner/loading indicator with no text
- Q: Should the cart page support inline address entry for shipping quotes, or defer to checkout? → A: Cart defers to checkout entirely — no shipping display needed; just stop shipping rates from being injected into the cart total. Cart shows product subtotal only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - No Premature Shipping in Cart (Priority: P1)

As an anonymous shopper browsing the cart, I should never see shipping rates, a selected shipping method, or shipping charges included in my total. The cart should clearly indicate that shipping will be calculated after I provide my address.

**Why this priority**: This is the most visible instance of the bug. Cart is the first place shoppers see totals, and misleading shipping charges here cause confusion and bounce. Fixing this addresses the highest-impact surface.

**Independent Test**: Add items to the cart as a guest (not logged in). View the cart page and/or cart drawer. Confirm no shipping rate, no shipping method with a dollar value, and no shipping amount in the total are displayed. Confirm a message like "Shipping calculated at checkout" or "Enter address for quote" is shown instead.

**Acceptance Scenarios**:

1. **Given** I am an anonymous shopper with items in my cart, **When** I view the cart page, **Then** no shipping rate or shipping method with a dollar amount is displayed.
2. **Given** I am an anonymous shopper with items in my cart, **When** I view the cart totals, **Then** the total does not include any shipping charge.
3. **Given** I am an anonymous shopper viewing the cart, **When** I look at the shipping section, **Then** I see a clear message indicating shipping will be quoted after I enter my address.
4. **Given** I am an anonymous shopper viewing the cart drawer (mini cart), **When** I check the totals, **Then** no shipping amount is included and no shipping method is shown.

---

### User Story 2 - No Premature Shipping in Checkout (Priority: P1)

As a shopper on the checkout page who has not yet entered a shipping address, I should not see any shipping rate, selected shipping method with a dollar value, or shipping charges reflected in my order total. The checkout should display a prompt to enter my address for a shipping quote.

**Why this priority**: Checkout is the conversion-critical page. Showing a misleading rate like "$110 Courier Expedited" before address entry undermines trust and causes abandonment. This is equally critical as the cart fix.

**Independent Test**: Navigate to checkout as a guest without filling in the address. Confirm no shipping method with a dollar value appears, no shipping amount is in the total, and the prompt to enter an address is displayed.

**Acceptance Scenarios**:

1. **Given** I am on the checkout page and have not entered a shipping address, **When** I view the shipping section, **Then** I see "Enter address for quote" or equivalent, and no shipping method with a dollar value is displayed.
2. **Given** I am on the checkout page with no address entered, **When** I view the order total, **Then** it does not include any shipping charge.
3. **Given** I am on the checkout page and the shipping section says "Enter address for quote", **When** I view the available shipping methods, **Then** no method is pre-selected or shown with a live rate.

---

### User Story 3 - Shipping Quotes After Address Entry (Priority: P2)

As a shopper who has entered a valid shipping address, I should receive accurate shipping quotes that I can select, and my order total should update to include the selected shipping charge.

**Why this priority**: This validates the "happy path" — ensuring the fix doesn't break the normal shipping flow. After the bug is fixed, the standard quoting behaviour must continue to work correctly.

**Independent Test**: On checkout, enter a valid Canadian shipping address. Confirm shipping methods with rates appear. Select one. Confirm the order total updates to include the selected shipping rate.

**Acceptance Scenarios**:

1. **Given** I am on the checkout page, **When** I enter a complete and valid shipping address, **Then** available shipping methods with rates are displayed.
2. **Given** shipping methods are displayed after address entry, **When** I select a shipping method, **Then** the order total updates to include the selected shipping charge.
3. **Given** I have selected a shipping method and it is reflected in my total, **When** I change my shipping address to a different valid address, **Then** shipping methods refresh and the total updates to reflect the new rates.

---

### User Story 4 - Stale Rates Do Not Persist After Address Change (Priority: P2)

As a shopper who changes my address or clears address fields after initially receiving a shipping quote, the previously displayed shipping rate should not persist in the total or UI. Shipping should revert to the "enter address" state or recalculate for the new address.

**Why this priority**: Prevents a scenario where partial address edits leave stale rates in the total, which is the likely root cause of this resurfaced bug. Addresses data consistency in shared cart state.

**Independent Test**: Enter a valid address to get a shipping quote. Then clear or change the address fields to an incomplete state. Confirm the shipping section reverts to "enter address" mode and the total no longer includes the previous shipping charge.

**Acceptance Scenarios**:

1. **Given** I have a valid address with shipping rates shown, **When** I clear required address fields (e.g., postal code), **Then** shipping methods are hidden and the total no longer includes shipping.
2. **Given** I have a shipping method selected, **When** I change my address to a different valid address, **Then** the shipping methods refresh and any previously selected method is cleared until I select a new one from the updated options.
3. **Given** I previously had a shipping rate in my total, **When** I navigate back to the cart from checkout after clearing my address, **Then** the cart does not show the previously quoted shipping rate.

---

### User Story 5 - Consistent Behaviour for Logged-In Users (Priority: P3)

As a logged-in shopper whose account may have a saved address, shipping quotes should only appear when a valid address is actively associated with the current session's cart. If no address is associated, the same "enter address" behaviour applies.

**Why this priority**: While the primary issue is with guest users, logged-in users with saved addresses could experience edge cases if the fix only targets anonymous flows. This ensures consistency across user types.

**Independent Test**: Log in with a user that has a saved address. Navigate to checkout — shipping should be quoted using the saved address. Log in with a user that has no saved address — shipping should require address entry before quoting.

**Acceptance Scenarios**:

1. **Given** I am logged in with a saved shipping address, **When** I view checkout, **Then** shipping methods appear using my saved address.
2. **Given** I am logged in but have no saved address, **When** I view checkout, **Then** I see the "enter address for quote" prompt and no premature shipping rates.
3. **Given** I am logged in and change my address on checkout, **When** I update address fields, **Then** shipping rates refresh and do not retain stale values from my saved address.

---

### Edge Cases

- What happens when a shopper enters a partial address (e.g., country and postal code but no street)? Shipping MUST NOT be quoted — all fields (country, province/state, city, postal code, street address) are required before a quote is requested.
- What happens when the shipping API returns zero available methods for a valid address? A "no shipping methods available" message should be shown, and no shipping charge should be added to the total.
- What happens when a shopper toggles between "ship to different address" and using a billing address in checkout? Shipping should recalculate based on whichever address is active for shipping.
- What happens if the cart state already has a previously cached shipping method from a prior session or page load? The stale method must be cleared or validated before being displayed.
- What happens for shoppers in regions where no shipping is offered (e.g., international addresses that the store doesn't ship to)? No shipping rate should appear, and an appropriate message should be shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST NOT display any shipping rate, shipping method with a dollar value, or shipping charge in the cart or checkout before a valid shipping address has been entered.
- **FR-002**: System MUST NOT include any shipping amount in the subtotal or order total before a valid shipping address has been entered.
- **FR-003**: Cart page and cart drawer MUST NOT display any shipping section, shipping method, or shipping-related messaging. Cart surfaces show product subtotal only. Checkout MUST display "Enter address for quote" when no valid address is available.
- **FR-004**: System MUST clear or invalidate any previously cached or selected shipping method when the shipping address becomes invalid or is cleared.
- **FR-005**: System MUST recalculate shipping when the shipping address changes, and MUST NOT retain stale rates from a previous address.
- **FR-006**: Cart surfaces (cart page, cart drawer) MUST show product subtotal only with no shipping injection. Checkout MUST reflect shipping eligibility accurately. All surfaces MUST be consistent — no surface may show a shipping charge that another surface does not.
- **FR-007**: System MUST allow shipping methods to appear and be selected normally once a valid address is provided.
- **FR-012**: System MUST display a spinner/loading indicator (no text) in the shipping section while shipping quotes are being fetched after a valid address has been entered. No shipping rate, method, or charge may be shown during this loading state.
- **FR-008**: System MUST update the order total to include the selected shipping charge only after a valid address has been entered and a method has been selected or auto-selected.
- **FR-009**: System MUST apply the same pre-address shipping suppression logic for both guest and authenticated users who lack a valid address on the current session.
- **FR-010**: System MUST NOT break existing checkout flows, payment integrations (Helcim, Stripe, PayPal), or order creation logic as a result of this fix.
- **FR-011**: System MUST preserve CAD currency display, Canadian locale presentation, and Canadian checkout behaviour throughout the fix.

### Key Entities

- **Cart State**: Shared state representing the shopper's cart contents, selected shipping method, shipping cost, and totals. Central to the bug — stale or premature shipping data in cart state is the likely root cause.
- **Shipping Address**: The set of address fields (country, province/state, city, postal code) required to request a shipping quote. Determines shipping quote eligibility.
- **Shipping Method**: A carrier/service option with a name and rate (e.g., "Courier Expedited 6-9 BDs $110"). Must only be visible and selectable after address validation.
- **Order Total**: Computed sum of item subtotal, taxes, and shipping. Shipping portion must be zero or excluded before a valid quote is obtained.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of cart views by anonymous shoppers without a shipping address show zero shipping charge in the total.
- **SC-002**: 100% of checkout views before address entry show no shipping method with a dollar value and no shipping amount in the total.
- **SC-003**: Shipping rates appear within normal expected time after a valid address is entered, with no regression in quoting speed.
- **SC-004**: Cart drawer, cart page, and checkout page all display consistent shipping state — no discrepancy between surfaces.
- **SC-005**: Guest checkout conversion flow (browse → cart → checkout → payment) completes without encountering misleading shipping charges at any step.
- **SC-006**: Existing payment integrations (Helcim, Stripe, PayPal) and order creation remain fully functional after the fix.
- **SC-007**: Reduction in guest bounce and cart abandonment attributed to premature shipping confusion (tracked over time post-deploy).

## Assumptions

- The root cause is in shared frontend state management (likely the `useCart` composable or related shipping/checkout synchronization), not in the WPGraphQL backend or WooCommerce shipping settings.
- The WooCommerce backend may return shipping data in the GraphQL cart response even without a valid address (e.g., cached from a prior session). The frontend MUST treat this data as untrusted and suppress/hide it whenever address validation fails. No backend mutations or server-side clearing are required — the fix is purely frontend display-layer suppression.
- A "valid shipping address" for quoting purposes means all address fields must be complete: country, province/state, city, postal code, and street address. Shipping quotes MUST NOT be requested until the full address is provided.
- The fix will be frontend-only and will not require changes to WordPress, WooCommerce, or the GraphQL schema.
- The Helcim admin-order-creation flow does not depend on pre-address shipping method selection and will not be affected by suppressing premature shipping display.
- The current "Enter address for quote" message text is acceptable and does not need redesign — it just needs to be consistently enforced alongside total suppression.
