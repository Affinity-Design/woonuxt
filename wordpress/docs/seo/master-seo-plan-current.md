# ProSkaters Place — Master SEO Plan (Current Truth)

**Site:** proskatersplace.com  
**Scope:** WordPress US property and its directly related SEO automation work  
**Current truth date:** April 7, 2026  
**Supersedes as operating document:** `master-seo-plan.md`

---

## What This Document Is

This is the working source of truth for WordPress SEO decisions.

It replaces the older pattern of treating the February audit, the brand-page rollout doc, and the automation registry as if they were equally current. They are not. Some of the February findings are still directionally useful, but several status claims are now stale or contradicted by the public site.

Use this document when deciding what to build next, what to measure, and what not to trust from earlier writeups.

---

## Current Truth Summary

### What is real and validated on live

- Brand-page automation is real, deployed, and visible on live brand archives.
- The custom mu-plugin `psp-brand-content-field.php` is a real production dependency for brand copy, FAQ schema, and Rank Math term meta.
- The brand pipeline has produced substantial visible output on pages such as `/brand/rollerblade/`, including long-form copy, internal links, FAQ content, and explicit retailer-positioning language.
- Blog/article publishing at scale is real and is already influencing important traffic pages.
- Some author presence now exists on articles through `PSP Team` and the `/author/manager/` archive, so the old claim of zero author attribution is no longer accurate.

### What is still materially incomplete

- The highest-value commercial fixes remain unbuilt: product-description rewrites, category-description upgrades, a real roller-skates hub page, quick-answer extraction blocks, and redirect cleanup for intent mismatches.
- Operational measurement is weak. Older docs define targets, but not a strong owner-based reporting loop.
- QA for AI-generated content is not strong enough for a site that wants durable SEO gains. Current validation guidance is too manual and too shallow.
- Category and article templates still contain stale market language, duplicated FAQs, broken or weak intent alignment, and obvious AI-style phrasing.

### What is stale or false in older docs

- “Homepage FAQ duplicate fixed on live” should not be treated as true. The duplicate roller-skate fit question is still visible on the live homepage FAQ block.
- “Zero author attribution” should not be treated as true. At least some articles now show `PSP Team` with an author archive.
- Canadian/Toronto wording inside WordPress SEO planning docs should not drive implementation for this property. The live WordPress site and its automation scripts are US-oriented.
- Documentation that implies all priority tiers moved to execution is overstated. The most valuable work is still in planning or not built.

---

## Operating Assumptions

1. This WordPress SEO workstream is for the US property, not the Canadian Nuxt frontend.
2. Market copy for this layer should be US-consistent unless a deliberate cross-site strategy says otherwise.
3. Brand-page automation is the strongest proven SEO system in this repo and should be treated as the implementation benchmark for other automations.
4. No future AI-assisted content rollout should be considered complete without page-level QA, schema validation, and Search Console follow-up.
5. Old docs remain reference material, not status truth.

---

## Strategic Priorities

### Priority 1: Fix commercial intent architecture

The main commercial risk is not lack of content volume. It is that valuable queries are still landing on the wrong assets or on shallow assets.

Work in this lane:

- Build the roller-skates hub page.
- Upgrade key category pages, starting with roller skates and inline skates.
- Resolve intent mismatches where commercial keywords rank to informational articles.

Why this is first:

- The biggest upside is on high-volume commercial terms already close enough to matter.
- This is the cleanest path to lift rankings, CTR, and conversion quality together.

### Priority 2: Raise content quality on pages already getting traffic

The article program is live and visible, but many pieces read like templated AI output and overuse generic “ultimate guide” framing.

Work in this lane:

- Add direct-answer openings and quick-answer sections where AI Overviews are likely.
- Reduce repetitive AI-style phrasing.
- Tighten internal linking around transactional destinations.
- Strengthen expert voice and trust signals on articles and category pages.

Why this is second:

- Traffic already exists.
- Content that earns clicks but weakens trust or fails to convert will create long-term ranking drag.

### Priority 3: Build a real governance loop

The project has enough plans. It does not yet have enough operational discipline.

Work in this lane:

- Assign explicit owners by role.
- Track leading indicators weekly.
- Define acceptance criteria before script execution.
- Record what actually ran, on which URLs, with what result.

Why this is third but mandatory:

- Without governance, the next wave of automation will recreate the same documentation drift.

---

## Work Completed and Trusted

### Trusted as deployed

| Area                   | Current truth            | Notes                                                                                                                          |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Brand-page optimizer   | Live and materially real | 69/76 completion claim is plausible and supported by live spot checks, but remaining failed brands still need explicit closure |
| Brand mu-plugin        | Live dependency          | Required for brand body copy and FAQ schema output                                                                             |
| Footer typo fix        | Treated as complete      | No live contradiction found in this audit pass                                                                                 |
| Media alt-text cleanup | Likely complete          | No live contradiction surfaced in this audit pass                                                                              |

### Completed but not fully closed operationally

| Area                       | Current truth             | What is missing                                                                              |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| Brand rollout              | Works on live pages       | Failed-brand retry list, Search Console follow-up, rich-result validation, and visual QA log |
| Shipping-threshold cleanup | Still unresolved globally | Manual Elementor/template source remains the blocker                                         |

### Not complete

| Area                          | Status           | Why it matters                                                    |
| ----------------------------- | ---------------- | ----------------------------------------------------------------- |
| Product-description rewrites  | Not built        | Largest content-scale ROI opportunity                             |
| Category-description upgrades | Not built        | Category pages remain too weak for head terms                     |
| Roller-skates hub page        | Not built        | Key answer to the position-47 problem                             |
| Quick-answer box automation   | Not built        | Needed for AI Overview extractability                             |
| Redirect cleanup              | Not built        | Important commercial queries still route poorly                   |
| Article quality retrofit      | Not systematized | Current content pattern risks thin differentiation                |
| E-E-A-T standardization       | Partial only     | Author archive exists, but author system is not fully intentional |

---

## Non-Negotiable Quality Gates

No SEO automation should be marked complete unless it passes all relevant gates below.

### Content gates

- The page answers the primary query directly in the opening section.
- The page has a clear commercial or informational intent and does not straddle both poorly.
- Internal links support the intended conversion path.
- Copy is not obviously templated or repetitive across pages.
- Market language is consistent with the US site.

### Technical gates

- Schema is present where promised and validated on a representative URL sample.
- Canonical, indexability, and template placement are checked on live URLs, not only in WordPress admin.
- Any redirect logic is verified with crawlable source and destination URLs.

### Measurement gates

- A before/after keyword set is recorded.
- Search Console monitoring window is assigned.
- A rollback or remediation path exists if quality or rankings regress.

---

## KPI Stack

### Primary business KPIs

- Organic sessions to commercial pages
- Revenue from organic landing sessions
- Conversion rate from organic sessions on category, brand, and article landing pages

### SEO operating KPIs

- Rank movement for `roller skates`, `roller blades`, `roller skate`, `inline skates`, and `how to rollerblade`
- Search Console CTR on upgraded category and hub pages
- Number of AI Overview-exposed queries with direct-answer formatting on-page
- Number of upgraded pages with validated schema
- Number of fixed intent mismatches

### Quality KPIs

- Pages passing manual QA on first review
- Pages requiring rollback or rewrite
- Pages with duplicated FAQ entries or stale market references after deployment

---

## 90-Day Execution Order

### Wave 1

- Clean homepage FAQ duplication.
- Fix the remaining global shipping-threshold inconsistency at the template source.
- Finalize failed-brand retry queue and confirm schema detection on a live sample.

### Wave 2

- Build `update-category-descriptions.js` for roller skates and inline skates first.
- Build and publish the roller-skates hub page.
- Define the exact redirect map for the worst intent mismatches before any plugin install.

### Wave 3

- Build `add-quick-answer-boxes.js` for priority articles with AI Overview exposure.
- Retrofit the top traffic articles to cleaner answer-first structures.
- Standardize author/bio presentation and trust signals on articles.

### Wave 4

- Build `rewrite-product-descriptions.js` only after QA rules are strict enough to avoid scaling mediocre copy.

---

## What To Stop Doing

- Stop treating February status claims as current production truth without a live check.
- Stop using Canadian or Toronto-oriented messaging in WordPress SEO docs for the US property.
- Stop marking automation as “done” when the code ran but the live page, schema, and indexing loop were not verified.
- Stop using weak QA language such as “open 3 random pages” for large AI-generated rollouts.

---

## Source Hierarchy Going Forward

1. Public live page behavior
2. `seo-execution-board.md`
3. This document
4. Script logs and generated data files
5. Historical docs: `master-seo-plan.md`, `seo-for-root.md`, `BrandPageSEO.md`, `automation plan.md`

---

## Related Documents

- `seo-execution-board.md` — owner, dependency, KPI, and QA tracker
- `live-seo-reality-check-2026-04-07.md` — page-level live validation
- `brand-optimization-report.md` — historical brand rollout record
- `automation plan.md` — script inventory and implementation concepts
