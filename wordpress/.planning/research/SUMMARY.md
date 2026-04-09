# Project Research Summary

**Project:** ProSkaters Place US WordPress SEO Program
**Domain:** Brownfield WordPress SEO operations and automation for an e-commerce property
**Researched:** 2026-04-07
**Confidence:** HIGH

## Executive Summary

This is not a greenfield SEO strategy problem. It is a brownfield WordPress SEO execution program that already has one proven automation system, the brand-page pipeline, alongside several high-value but unfinished commercial and editorial workstreams. Experts would not solve this by publishing more content indiscriminately. They would first lock current truth, define acceptance and ownership, then improve the highest-leverage commercial destinations and only scale automation after quality controls are real.

The recommended approach is to treat the April 7, 2026 operating docs plus live-page behavior as the authoritative baseline, then sequence work in three layers: governance and template hygiene first, commercial intent architecture second, and broader editorial or product-description automation last. The biggest risks are documentation drift, mixed-market template leakage, and scaling mediocre AI-assisted copy before QA and rollback are mature.

## Key Findings

### Recommended Stack

The right stack is already mostly in place. Use WordPress plus PHP for runtime rendering concerns, Node.js scripts for repeatable SEO batch work, Rank Math surfaces where schema-aware metadata already exists, and external validation tools such as Search Console, Rich Results Test, and Screaming Frog for proof. The research does not support introducing a brand-new content system or plugin-heavy workflow as the first move.

**Core technologies:**

- WordPress: CMS and template layer — the live property already depends on it, so the strategy should extend existing seams.
- PHP and mu-plugins: runtime logic and schema-bearing field support — already proven by the live brand-page pipeline.
- Node.js 20.x: automation runtime — already used in `wordpress/scripts/` for SEO cleanup and brand operations.
- Search Console plus crawl/schema validation: measurement and proof layer — required to distinguish live verified work from code execution.

### Expected Features

The must-have features are operational, not cosmetic: owner and KPI tracking, live QA, commercial category upgrades, redirect mapping, and AI-content guardrails. The differentiators are a strong existing automation benchmark, answer-first editorial patterns, and a rollout model that can scale only after proving quality. The highest-risk item, product-description rewriting, should stay deferred until the QA system exists.

**Must have (table stakes):**

- Governance baseline with workstream ownership and QA artifacts — users of the program expect accountability.
- Template hygiene fixes — the live site still contradicts prior completion claims.
- Commercial category upgrades and redirect governance — these drive the clearest revenue upside.

**Should have (competitive):**

- Answer-first article retrofit — improves extractability and editorial usefulness.
- Stronger trust and byline layer — builds on partial progress instead of pretending it does not exist.
- Rollback-safe automation model — enables scale without betting the property on one script run.

**Defer (v2+):**

- Scaled product-description rewrites — high upside, highest quality risk.

### Architecture Approach

The architecture should stay simple and explicit: strategy docs define current truth, `.planning/` translates them into phases and requirements, `wordpress/scripts/` and `wordpress/mu-plugins/` implement the work, and live validation tools close the loop. The key pattern is `document the workstream -> implement through a known seam -> validate on live URLs -> attach measurement evidence`.

**Major components:**

1. Strategy docs — define truth, priorities, and blockers.
2. Planning workspace — turn strategy into phases, requirements, and execution memory.
3. WordPress automation and runtime layer — scripts, mu-plugins, and controlled plugin settings.
4. Validation layer — live URLs, schema tests, crawl checks, and Search Console follow-up.

### Critical Pitfalls

1. **Documentation drift presented as completion** — avoid it by requiring live verification and source hierarchy discipline.
2. **Scaling mediocre AI content** — avoid it with sampled rollouts, QA rubrics, and rollback criteria.
3. **Tooling installed before strategy exists** — avoid it by separating mapping and approval from dependency installation.
4. **Mixed-market template leakage** — avoid it by treating US wording cleanup as part of each template upgrade.
5. **Commercial queries landing on the wrong asset** — avoid it by building destination pages before rolling redirects.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Governance Baseline

**Rationale:** The project currently suffers from weak ownership and incomplete completion criteria.
**Delivers:** Source-of-truth alignment, artifact tracking, KPI review cadence, and status vocabulary.
**Addresses:** Governance table stakes from FEATURES.md.
**Avoids:** Documentation drift.

### Phase 2: Template Hygiene Fixes

**Rationale:** Known live contradictions should be removed before broader rollout work.
**Delivers:** FAQ dedupe and shipping-threshold source cleanup.
**Uses:** Existing cleanup scripts and WordPress template tracing.
**Implements:** Live-verified hygiene fixes on shared templates.

### Phase 3: Brand Rollout Closure

**Rationale:** The strongest proven automation should become fully measured and operationally closed before new automation expands.
**Delivers:** Failed-brand closure, schema sample checks, and Search Console follow-up.

### Phase 4: Commercial Category Upgrade

**Rationale:** The biggest commercial upside is on category pages and the missing roller-skates hub.
**Delivers:** Category rewrites, US wording cleanup, and a dedicated hub page.

### Phase 5: Intent Routing and Redirects

**Rationale:** Redirects depend on better destination assets and reviewed mappings.
**Delivers:** Query-to-URL map, redirect dependency setup, and live redirect validation.

### Phase 6: Answer-First Article Retrofit

**Rationale:** Article quality should support the new intent architecture, not compete with it.
**Delivers:** Direct-answer openings, better quick-answer patterns, and stronger editorial quality.

### Phase 7: Trust and Author Layer

**Rationale:** Partial byline progress exists, so this should refine and standardize rather than start from zero.
**Delivers:** A practical E-E-A-T layer for article templates.

### Phase 8: Product Rewrite Readiness

**Rationale:** Product rewrites are valuable but too risky to scale until the QA system proves itself.
**Delivers:** Rubric, sampling, rollback plan, and scale readiness criteria.

### Phase Ordering Rationale

- Governance comes first because quality and measurement are current root causes, not just missing tactics.
- Category and hub work precede redirects because routing should favor stronger destination assets.
- Article and product rewrite work follow commercial architecture so they reinforce, rather than confuse, intent.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4:** Category upgrade execution details and template ownership may require code and content-system research.
- **Phase 5:** Redirect plugin/API behavior and rollback design need implementation-specific research.
- **Phase 8:** Product rewrite QA and rollback standards need deeper operational design.

Phases with standard patterns (skip research-phase):

- **Phase 1:** Mostly documentation and workflow normalization.
- **Phase 2:** Known cleanup issues with existing repo scripts and live examples.
- **Phase 3:** Existing brand automation is already well understood in this repo.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                   |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| Stack        | MEDIUM     | Tooling and seams are clear from the repo, but exact production plugin versions still need confirmation |
| Features     | HIGH       | The operating docs are explicit about priorities, blockers, and required quality gates                  |
| Architecture | HIGH       | The repo already shows the implementation seams and the docs define how work should flow                |
| Pitfalls     | HIGH       | Live contradictions and execution gaps are directly documented and validated                            |

**Overall confidence:** HIGH

### Gaps to Address

- Exact WordPress and plugin versions: confirm during implementation before depending on version-specific behavior.
- Redirect deployment mechanics: confirm plugin/API access and rollback path before Phase 5 execution.
- Search Console access and owner assignment: resolve before treating reporting loops as operational.

## Sources

### Primary (HIGH confidence)

- `wordpress/docs/master-seo-plan-current.md` — current operating truth
- `wordpress/docs/seo-execution-board.md` — owners, dependencies, KPI targets, and blockers
- `wordpress/docs/live-seo-reality-check-2026-04-07.md` — live validation baseline
- `wordpress/scripts/` and `wordpress/mu-plugins/` — current implementation seams

### Secondary (MEDIUM confidence)

- Repo structure and existing automation filenames — strong indicators of current workflow patterns

### Tertiary (LOW confidence)

- Exact plugin-version assumptions — needs validation during execution

---

_Research completed: 2026-04-07_
_Ready for roadmap: yes_
