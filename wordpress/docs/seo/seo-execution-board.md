# ProSkaters Place — SEO Execution Board

**Date created:** April 7, 2026  
**Purpose:** Convert the SEO roadmap into an operating tracker with explicit ownership, dependencies, KPIs, and QA gates.

---

## Owner Model

Use role owners until specific names are assigned.

| Role           | Responsibility                                                              |
| -------------- | --------------------------------------------------------------------------- |
| SEO Lead       | Priority order, keyword targets, Search Console review, acceptance sign-off |
| WordPress Dev  | Scripts, plugin setup, template fixes, deployment safety                    |
| Content Lead   | Editorial quality, tone, factual review, internal-link logic                |
| Analytics Lead | Baselines, KPI reporting, annotation of release dates                       |
| QA Reviewer    | Live-page checks, schema validation, regression checks                      |

---

## Active Board

| Workstream                             | Status                         | Owner                        | Dependencies                                      | KPI Target                                                                        | QA Gate                                                                                            | Notes                                                     |
| -------------------------------------- | ------------------------------ | ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Homepage FAQ dedupe                    | Ready now                      | WordPress Dev                | None                                              | Remove duplicate question from live homepage FAQ                                  | Live homepage no longer repeats the fit question; FAQ schema sample checked                        | Older docs say this is fixed; live reality says it is not |
| Global shipping-threshold cleanup      | Blocked on template source     | WordPress Dev                | Identify Elementor/global template source         | One consistent shipping threshold across homepage, category, and support surfaces | Search site for `$99` and `$150`; verify intended policy appears consistently                      | Script already proved partial automation was insufficient |
| Failed brand-page retries              | In progress backlog            | SEO Lead + WordPress Dev     | Existing brand pipeline, failed-brand list        | Close remaining 7 failed brands                                                   | 5-page live sample, FAQ schema detected, content placement confirmed                               | Treat as operational closure, not new strategy            |
| Brand-page post-rollout validation     | Ready now                      | QA Reviewer + Analytics Lead | Search Console access, rich-results test          | Indexing requested and monitored for updated brand URLs                           | Search Console annotation, rich-results sample, ranking watchlist                                  | Brand rollout is live but under-measured                  |
| Category description upgrade script    | Not started                    | WordPress Dev + Content Lead | Content brief for roller skates and inline skates | Lift rankings/CTR on core category pages                                          | Live copy review, schema check if added, internal-link review                                      | First script to build after cleanup work                  |
| Roller-skates hub page                 | Not started                    | SEO Lead + Content Lead      | Category strategy, updated internal links         | Improve `roller skates` visibility from deep page 1/2 positions toward top 10     | Live page published, indexed, linked from relevant templates                                       | Highest-priority commercial content asset                 |
| Intent-mismatch redirect plan          | Not started                    | SEO Lead                     | Query-to-URL map                                  | Fix major mismatches for `roller blades` and `roller skate`                       | Mapping reviewed before implementation                                                             | Do mapping first, plugin second                           |
| Redirection plugin install             | Blocked by admin action        | WordPress Dev                | WP Admin access, approved plugin install          | Enable redirect automation endpoint                                               | Plugin installed, API reachable, rollback documented                                               | Keep plugin install separate from redirect logic          |
| Redirect implementation                | Not started                    | WordPress Dev                | Redirection plugin, approved mapping              | Correct routing for highest-value mismatches                                      | Header response, destination quality, recrawl request                                              | Do not bulk ship without reviewed map                     |
| Quick-answer box automation            | Not started                    | WordPress Dev + Content Lead | AI Overview keyword list, article priority list   | Add answer-first extraction blocks to priority URLs                               | Opening paragraph answers query directly; page still reads naturally; schema if promised validates | Medium priority, high upside on answerable queries        |
| Article retrofit for top traffic posts | Not started                    | Content Lead                 | Reality-check list of weak articles               | Raise conversion quality and trust on traffic-driving posts                       | Human editorial review on each updated page                                                        | Start with cost article and latest rollerskating articles |
| Author/E-E-A-T standardization         | Not started                    | Content Lead + WordPress Dev | Author model decision                             | Consistent byline/bio/trust presentation on articles                              | Byline visible, author page useful, trust blocks not broken on mobile                              | Existing `PSP Team` presence proves partial progress only |
| Product-description rewrite script     | Deferred until QA model exists | WordPress Dev + Content Lead | QA rubric, prompt rules, rollback process         | Replace manufacturer-copy dependency without scaling low-quality AI text          | 10-page sample passes editorial and SEO review before wider run                                    | Highest ROI, highest risk if executed badly               |

---

## Immediate Sequence

1. Fix homepage FAQ duplication.
2. Fix shipping-threshold inconsistency at the source template.
3. Close the brand rollout operationally: failed brands, rich-results checks, Search Console annotations.
4. Build category upgrades and the roller-skates hub page.
5. Install redirect dependency and execute reviewed redirect mappings.
6. Improve answer-first article formatting and author presentation.
7. Only then scale product-description rewriting.

---

## KPI Review Cadence

### Weekly

- Rankings for core commercial terms
- Search Console clicks, CTR, and average position on touched URLs
- New indexing or rich-result errors
- QA failures and regressions

### Monthly

- Organic sessions to category, hub, brand, and article templates
- Organic revenue and conversion rate by landing-page type
- AI Overview visibility wins or losses on targeted queries
- Count of pages upgraded versus count of pages accepted

---

## Required Artifacts Per Workstream

Every completed workstream should leave behind:

- the URL list touched
- before/after keyword set
- execution date
- owner sign-off
- QA result
- Search Console review date

If those are missing, the workstream is not complete.

---

## Blockers To Resolve Early

| Blocker                           | Impact                             | Owner                        |
| --------------------------------- | ---------------------------------- | ---------------------------- |
| No named human owners in docs     | Slows accountability and approvals | SEO Lead                     |
| Weak AI content QA standard       | Makes scaled content risky         | Content Lead                 |
| Redirection plugin not installed  | Prevents redirect automation       | WordPress Dev                |
| Incomplete live verification loop | Causes documentation drift         | QA Reviewer + Analytics Lead |

---

## Definition Of Done

A workstream is done only when:

- implementation is live
- live pages pass QA
- relevant schema or redirect behavior is validated
- KPIs are attached to the release
- the execution board status is updated

Code execution alone is not completion.
