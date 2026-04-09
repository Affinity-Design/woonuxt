# Requirements: ProSkaters Place US WordPress SEO Program

**Defined:** 2026-04-07
**Core Value:** Ship SEO changes that improve high-value commercial visibility and conversion quality on the live US WordPress site without scaling weak content or unverified automation.

## v1 Requirements

### Governance

- [ ] **GOV-01**: Every SEO workstream has a named role owner, dependencies, KPI target, QA gate, and completion artifact list.
- [ ] **GOV-02**: Every automation or template change records the URLs touched, execution date, sign-off owner, QA result, and Search Console review date.
- [ ] **GOV-03**: Status language distinguishes between `planned`, `code exists`, `live`, and `live and verified`.

### Template Hygiene

- [ ] **HYG-01**: Homepage FAQ duplication is removed from the live homepage and any shared template surfaces.
- [ ] **HYG-02**: Global shipping-threshold messaging comes from a single intended template source and is consistent across affected pages.
- [ ] **HYG-03**: Priority commercial templates no longer contain stale Toronto or mixed-market wording.
- [ ] **HYG-04**: Priority commercial templates no longer expose malformed or low-confidence supporting links.

### Brand Operations

- [ ] **BRD-01**: The failed-brand retry queue is closed or explicitly documented with blockers and next action.
- [ ] **BRD-02**: A live sample of brand pages is checked for visible content placement and FAQ schema output.
- [ ] **BRD-03**: Updated brand URLs have Search Console follow-up and rich-results validation logged.

### Commercial Intent

- [ ] **COM-01**: Roller skates and inline skates category pages have US-consistent, intent-aligned copy that supports conversion and internal linking.
- [ ] **COM-02**: A dedicated roller-skates hub page exists, is linked from relevant templates, and targets the intended commercial query set.
- [ ] **COM-03**: High-value keyword-to-URL mismatches are mapped before redirect implementation.
- [ ] **COM-04**: Reviewed redirects are validated on live URLs after deployment.

### Editorial Quality

- [ ] **EDT-01**: Priority traffic articles open with direct answers where AI Overview-style extraction is likely.
- [ ] **EDT-02**: Priority traffic articles are revised to reduce templated AI phrasing and improve expert density.
- [ ] **EDT-03**: Article templates present bylines, author pages, and trust elements consistently enough to support stronger E-E-A-T signals.

### Automation Safety

- [ ] **AUT-01**: Category description automation uses a written brief, review sample, and rollback path before scaling.
- [ ] **AUT-02**: Quick-answer block automation preserves readability, intent clarity, and promised schema behavior.
- [ ] **AUT-03**: Product-description rewrite automation is blocked from scale until a QA rubric and 10-page acceptance sample exist.

## v2 Requirements

### Expansion

- **EXP-01**: Extend category upgrade automation beyond the first two commercial categories.
- **EXP-02**: Expand author attribution beyond `PSP Team` to stronger expert-led profiles where operationally feasible.
- **EXP-03**: Scale product-description rewriting only after v1 QA controls prove reliable.
- **EXP-04**: Build recurring reporting views from Search Console and analytics rather than relying on manual spot checks.

## Out of Scope

| Feature                                         | Reason                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Canadian storefront SEO work                    | Separate market, separate frontend, separate planning track |
| Bulk redirect shipping without reviewed mapping | High risk of routing commercial terms to weak destinations  |
| Sitewide AI rewriting without live QA           | High ROI potential, but highest quality-risk workstream     |
| Unrelated WooCommerce feature work              | Not part of the SEO execution objective                     |

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| GOV-01      | Phase 1 | Pending |
| GOV-02      | Phase 1 | Pending |
| GOV-03      | Phase 1 | Pending |
| HYG-01      | Phase 2 | Pending |
| HYG-02      | Phase 2 | Pending |
| HYG-03      | Phase 4 | Pending |
| HYG-04      | Phase 4 | Pending |
| BRD-01      | Phase 3 | Pending |
| BRD-02      | Phase 3 | Pending |
| BRD-03      | Phase 3 | Pending |
| COM-01      | Phase 4 | Pending |
| COM-02      | Phase 4 | Pending |
| COM-03      | Phase 5 | Pending |
| COM-04      | Phase 5 | Pending |
| EDT-01      | Phase 6 | Pending |
| EDT-02      | Phase 6 | Pending |
| EDT-03      | Phase 7 | Pending |
| AUT-01      | Phase 4 | Pending |
| AUT-02      | Phase 6 | Pending |
| AUT-03      | Phase 8 | Pending |

**Coverage:**

- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---

_Requirements defined: 2026-04-07_
_Last updated: 2026-04-07 after initial definition_
