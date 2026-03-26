# Tasks: Fix Shipping Quote Glitch

**Input**: Design documents from `/specs/001-fix-shipping-quote-glitch/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), quickstart.md (✅)

**Tests**: No automated test tasks — project has no test framework configured. Validation is manual per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared `isShippingAddressComplete` validation logic that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Add `isShippingAddressComplete` computed ref that checks all 5 address fields (address1, city, state, country, postcode) and respects `shipToDifferentAddress` toggle, then export it from `useCheckout()` return object in `composables/useCheckout.ts`
- [x] T002 Add address completeness early-return gate at top of `updateShippingLocation()` to skip the `GqlUpdateCustomer` mutation when address is incomplete in `composables/useCheckout.ts`

**Checkpoint**: Shared validation function available — user story implementation can now begin

---

## Phase 2: User Story 1 — No Premature Shipping in Cart (Priority: P1) 🎯 MVP

**Goal**: Cart drawer shows product subtotal only — no shipping rates, methods, or charges ever appear

**Independent Test**: Add items to cart as guest. Open cart drawer. Confirm only product subtotal shown, no shipping rate/method/charge in total.

### Implementation for User Story 1

- [x] T003 [US1] Verify `components/shopElements/Cart.vue` displays product subtotal only with no shipping line items, no shipping methods, and no shipping charge in the total — document any issues found and fix if needed

**Checkpoint**: Cart drawer verified — shipping never leaks into cart surface

---

## Phase 3: User Story 2 — No Premature Shipping in Checkout (Priority: P1)

**Goal**: Checkout page suppresses all shipping display (rates, methods, charges, total inclusion) until a valid address is entered

**Independent Test**: Navigate to checkout as guest without filling address. Confirm no shipping method with dollar value appears, no shipping in total, and "Enter address for quote" prompt is shown.

### Implementation for User Story 2

- [x] T004 [P] [US2] Replace `hasShippingAddress` computed (postal-code-only check) with `isShippingAddressComplete` from `useCheckout()` in `components/shopElements/OrderSummary.vue` — shipping line shows "Enter address for quote" when incomplete, shows shipping cost when complete; total excludes shipping when address incomplete
- [x] T005 [P] [US2] Gate the shipping methods section (`v-if="cart.availableShippingMethods.length"`) to also require `isShippingAddressComplete` in `pages/checkout.vue`
- [x] T006 [P] [US2] Import `isShippingAddressComplete` from `useCheckout()` and wrap all `updateShippingLocation()` calls (on blur, input debounce, change events) with an address completeness guard in `components/forms/BillingDetails.vue`

**Checkpoint**: Checkout page fully suppresses premature shipping — no rates, methods, or charges shown without valid address

---

## Phase 4: User Story 3 — Shipping Quotes After Address Entry (Priority: P2)

**Goal**: After entering a complete address, shipping methods appear with a loading spinner during fetch; order total updates to include selected shipping charge

**Independent Test**: On checkout, fill all 5 address fields with a valid Canadian address. Confirm spinner shows briefly, then shipping methods with rates appear. Select one. Confirm total updates.

### Implementation for User Story 3

- [x] T007 [P] [US3] Add loading spinner (LoadingIcon, no text) to the shipping line in `components/shopElements/OrderSummary.vue` — show when `isUpdatingCart` is true AND `isShippingAddressComplete` is true
- [x] T008 [P] [US3] Add loading spinner to the shipping methods area in `pages/checkout.vue` — show when `isUpdatingCart` is true AND `isShippingAddressComplete` is true AND no shipping methods are yet available

**Checkpoint**: Happy path works — address entry triggers spinner → shipping methods appear → total updates with selected method

---

## Phase 5: User Story 4 — Stale Rates Do Not Persist After Address Change (Priority: P2)

**Goal**: When address fields are cleared or changed to incomplete after a valid quote was received, shipping display reverts to the "enter address" state and the total excludes shipping

**Independent Test**: Enter a valid address to get a quote. Clear the postal code field. Confirm shipping methods disappear, total reverts to exclude shipping, and "Enter address for quote" reappears.

### Implementation for User Story 4

- [x] T009 [US4] Verify reactive behavior: confirm that clearing any of the 5 address fields causes `isShippingAddressComplete` to return false, which hides shipping methods in `pages/checkout.vue` and reverts the OrderSummary total to exclude shipping in `components/shopElements/OrderSummary.vue` — fix any reactivity gaps found

**Checkpoint**: Stale rates never persist — clearing any address field immediately reverts shipping display

---

## Phase 6: User Story 5 — Consistent Behaviour for Logged-In Users (Priority: P3)

**Goal**: Logged-in users with saved addresses see shipping quotes automatically; logged-in users without saved addresses see the "enter address" prompt — same logic applies to both guest and authenticated flows

**Independent Test**: Log in with a user that has a full saved address — shipping quotes should appear on checkout. Log in with a user without a saved address — should see "enter address for quote" prompt.

### Implementation for User Story 5

- [x] T010 [US5] Verify that `isShippingAddressComplete` correctly evaluates saved address data from `customer.value.billing` (and `customer.value.shipping` when toggled) for logged-in users in `composables/useCheckout.ts` — confirm no special-case logic is needed beyond the existing 5-field check

**Checkpoint**: Guest and authenticated users experience identical shipping suppression behavior

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation across all surfaces and payment integrations

- [x] T011 Run all 7 manual test scenarios from `specs/001-fix-shipping-quote-glitch/quickstart.md` and verify each passes
- [x] T012 Verify Helcim payment flow completes successfully with shipping included in the paid amount after valid address entry on `pages/checkout.vue`
- [x] T013 Verify CAD currency formatting is preserved in shipping display and totals across `components/shopElements/OrderSummary.vue` and `components/shopElements/Cart.vue`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **US1 (Phase 2)**: Depends on Phase 1 completion. Independent of US2-US5.
- **US2 (Phase 3)**: Depends on Phase 1 completion. Independent of US1.
- **US3 (Phase 4)**: Depends on Phase 3 (US2) — spinner builds on top of the gated shipping display.
- **US4 (Phase 5)**: Depends on Phase 3 (US2) — verifies reactivity of the gates implemented in US2.
- **US5 (Phase 6)**: Depends on Phase 1 completion. Independent of US1-US4 (verification only).
- **Polish (Phase 7)**: Depends on all prior phases.

### Within Each User Story

- No automated tests to write first (manual testing only)
- Implementation tasks before verification tasks
- Core logic before display logic

### Parallel Opportunities

**After Phase 1 completes:**

- US1 (Phase 2) and US2 (Phase 3) can run in parallel — different files, independent stories
- US5 (Phase 6) can run in parallel with US1/US2 — verification only

**Within Phase 3 (US2):**

- T004, T005, T006 are all in different files and can run in parallel

**Within Phase 4 (US3):**

- T007, T008 are in different files and can run in parallel

---

## Parallel Example: User Story 2

```bash
# After Phase 1 (Foundational) is complete, launch all US2 tasks together:
Task T004: "Replace hasShippingAddress with isShippingAddressComplete in components/shopElements/OrderSummary.vue"
Task T005: "Gate shipping methods section on isShippingAddressComplete in pages/checkout.vue"
Task T006: "Guard updateShippingLocation() calls in components/forms/BillingDetails.vue"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Foundational (T001, T002)
2. Complete Phase 2: US1 — Cart verification (T003)
3. Complete Phase 3: US2 — Checkout suppression (T004, T005, T006)
4. **STOP and VALIDATE**: Test cart and checkout independently
5. Deploy if ready — the core bug is fixed

### Incremental Delivery

1. Phase 1 (Foundational) → Shared validation ready
2. Phase 2 (US1) + Phase 3 (US2) → Core bug fixed across both surfaces → **Deploy (MVP!)**
3. Phase 4 (US3) → Loading spinner polish → Deploy
4. Phase 5 (US4) → Stale rate verification → Deploy
5. Phase 6 (US5) → Logged-in user verification → Deploy
6. Phase 7 (Polish) → End-to-end validation → Final deploy

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- No automated tests — project uses manual testing per quickstart.md
- All changes are frontend-only — no WordPress/GraphQL/backend modifications
- Cart.vue (US1) likely needs no code changes — existing implementation already correct
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
