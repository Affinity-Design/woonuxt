# ProSkaters Place US WordPress SEO Program

## What This Is

This project scopes the US WordPress SEO workstream for proskatersplace.com into a GSD planning workspace. It focuses on fixing commercial intent architecture, raising on-page content quality, and adding governance around automation so the site can grow rankings and revenue without repeating documentation drift or low-quality AI rollouts.

The working source of truth is the current live site plus the April 7, 2026 operating documents in wordpress/docs. This project is not the Canadian Nuxt frontend; it is the US WordPress property and the tooling, scripts, and QA loops that support it.

## Core Value

Ship SEO changes that improve high-value commercial visibility and conversion quality on the live US WordPress site without scaling weak content or unverified automation.

## Requirements

### Validated

- ✓ Brand-page automation is live and materially real on production brand archives.
- ✓ The custom mu-plugin `psp-brand-content-field.php` is an active dependency for brand copy and FAQ schema output.
- ✓ Article byline presence is partial through `PSP Team`, so author attribution is no longer a greenfield problem.

### Active

- [ ] Establish a governance baseline with explicit owners, KPIs, QA gates, and artifact tracking for every SEO workstream.
- [ ] Fix template hygiene issues that directly contradict current truth, starting with homepage FAQ duplication and global shipping-threshold inconsistency.
- [ ] Close the operational loop on brand-page rollout with failed-brand retries, schema checks, and Search Console follow-up.
- [ ] Upgrade the highest-value commercial assets, starting with roller skates and inline skates category pages plus a dedicated roller-skates hub page.
- [ ] Define and ship a reviewed redirect strategy for major intent mismatches before any bulk redirect deployment.
- [ ] Retrofit top traffic articles with answer-first structure, stronger trust signals, and less templated AI phrasing.
- [ ] Define the tooling, QA rubric, and rollback path required before any scaled product-description rewrite automation.

### Out of Scope

- Canadian Nuxt frontend SEO execution — separate property, separate market constraints.
- Blind bulk AI content generation without page-level QA, schema validation, and Search Console follow-up.
- Large visual redesign work unrelated to search intent, content quality, or WordPress SEO automation.
- Treating older February documents as production truth without live verification.

## Context

- Current truth lives in `wordpress/docs/master-seo-plan-current.md`, supported by `wordpress/docs/seo-execution-board.md` and `wordpress/docs/live-seo-reality-check-2026-04-07.md`.
- The strongest proven system already in this repo is the brand-page pipeline, supported by `wordpress/mu-plugins/psp-brand-content-field.php` and scripts such as `wordpress/scripts/optimize-brand-page.js`.
- Existing automation already covers targeted cleanup work such as `dedup-homepage-faq.js`, `fix-shipping-threshold.js`, `fix-media-alt-text.js`, and brand auditing/optimization helpers.
- The biggest gaps are not content volume; they are intent alignment, template quality, mixed-market language cleanup, redirect governance, and measurement discipline.
- This is a brownfield repo. A full codebase map is still worth doing if the project expands beyond the WordPress SEO workstream, but it is not required to initialize this scoped SEO program.

## Constraints

- **Property boundary**: Scope is the US WordPress property — implementation and copy must stay US-consistent unless a deliberate cross-site strategy says otherwise.
- **Truth source**: Public live behavior outranks stale docs — every status claim must survive a live-page check.
- **Quality gate**: No automation is complete until live QA, schema validation, KPI attachment, and a follow-up review window exist.
- **Repo boundary**: WordPress changes may affect shared infrastructure — anything that touches plugins, redirects, or shared templates needs explicit blast-radius review.
- **Execution style**: Prefer existing script and mu-plugin seams before introducing new tooling or new plugin dependencies.

## Key Decisions

| Decision                                                                           | Rationale                                                                  | Outcome   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| Use `master-seo-plan-current.md` as the operating brief                            | It supersedes stale status claims and aligns planning to live-site reality | ✓ Good    |
| Scope this GSD project to the US WordPress SEO layer                               | The repo also contains Canadian Nuxt concerns that would blur priorities   | ✓ Good    |
| Treat brand automation as the benchmark pattern for future automations             | It is the clearest proven SEO system already deployed on live pages        | ✓ Good    |
| Make governance and QA a first-class deliverable, not admin overhead               | Weak ownership and shallow validation are current root causes of drift     | ✓ Good    |
| Defer full-repo brownfield mapping unless this project expands beyond `wordpress/` | The immediate need is the SEO program, not a whole-repo architecture audit | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:

1. Requirements invalidated? Move them to Out of Scope with reason.
2. Requirements validated? Move them to Validated with phase reference.
3. New requirements emerged? Add them to Active.
4. Decisions to log? Add them to Key Decisions.
5. `What This Is` still accurate? Update if reality drifted.

**After each milestone**:

1. Review all sections against live-site behavior.
2. Recheck the Core Value against current SEO priorities.
3. Audit Out of Scope to confirm exclusions still make sense.
4. Refresh Context with new metrics, blockers, and tooling lessons.

---

_Last updated: 2026-04-07 after initialization_
