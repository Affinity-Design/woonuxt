# Stack Research

**Domain:** WordPress SEO automation and content operations for a live e-commerce property
**Researched:** 2026-04-07
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology    | Version        | Purpose                                                                 | Why Recommended                                                                                                                           |
| ------------- | -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| WordPress     | 6.x            | CMS, template layer, taxonomy and content rendering                     | The live US property already runs here, so the winning strategy is extending proven WordPress seams instead of creating a parallel system |
| PHP           | 8.2+           | Runtime for mu-plugins, theme hooks, and server-side template logic     | Production SEO behavior such as brand content fields already depends on PHP-level WordPress extensions                                    |
| Node.js       | 20.x           | Repo-standard runtime for SEO automation scripts and content transforms | The repo already uses Node 20 and existing SEO automation lives in `wordpress/scripts/*.js`                                               |
| Rank Math SEO | current stable | SEO metadata and term-meta surface for schema-aware content fields      | The live brand pipeline already integrates with Rank Math term metadata                                                                   |

### Supporting Libraries

| Library                   | Version          | Purpose                                                                                | When to Use                                                                            |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| WP-CLI                    | 2.x              | Safe scripted inspection and maintenance against WordPress data                        | Use for repeatable audits, dry runs, and operational cleanup where shell access exists |
| Redirection plugin        | current stable   | Managed redirect storage and API-backed redirect execution                             | Use only after a reviewed redirect map exists and rollback is documented               |
| Google Search Console     | current platform | Indexing, query, CTR, and post-release monitoring                                      | Use for all workstreams that affect rankings, snippets, or indexing                    |
| Google Rich Results Test  | current platform | Validate FAQ or other structured data on live samples                                  | Use whenever a workstream promises schema output                                       |
| Screaming Frog SEO Spider | current stable   | Crawl-based QA for duplicate elements, canonicals, redirects, and template regressions | Use after template or redirect changes and before marking work complete                |

### Development Tools

| Tool                                     | Purpose                                                | Notes                                                                                    |
| ---------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| npm                                      | Install and run repo scripts                           | Already standard in this repo; use for script-based SEO tasks under `wordpress/scripts/` |
| git                                      | Diff planning docs, scripts, and plugin changes safely | Keep operational changes reviewable and isolated by workstream                           |
| Search Console annotations and work logs | Tie releases to outcomes                               | Without this, SEO work quickly drifts into unverifiable claims                           |

## Installation

```bash
# Repo dependencies
npm install

# WordPress operational tooling
wp --info

# Crawl and validation tooling are external services or desktop tools:
# - Google Search Console
# - Google Rich Results Test
# - Screaming Frog SEO Spider
```

## Alternatives Considered

| Recommended                               | Alternative                            | When to Use Alternative                                                                                        |
| ----------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| WordPress mu-plugins and targeted scripts | Large page-builder-only edits          | Use page-builder edits only when the template source is locked there and cannot be cleanly centralized in code |
| Reviewed Redirection plugin rollout       | Ad hoc server or spreadsheet redirects | Use manual redirect handling only for tiny emergency fixes; it does not scale safely for a program of record   |
| Search Console plus live QA               | Rank tracking only                     | Use rank tracking as a supplement, not the source of truth for release validation                              |

## What NOT to Use

| Avoid                                                        | Why                                                             | Use Instead                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Bulk AI rewrite scripts without QA gates                     | Fast to run, expensive to unwind when quality drops             | Sample-based rollouts with human review and rollback criteria   |
| Plugin installs before mapping the behavior they will manage | Creates operational dependency before the strategy is validated | Define reviewed mappings, acceptance checks, and rollback first |
| Old SEO status docs as release truth                         | They already contradict current live behavior                   | Live-page checks plus April 7, 2026 operating docs              |

## Stack Patterns by Variant

**If work is a repeatable content or taxonomy transformation:**

- Use Node.js automation in `wordpress/scripts/`
- Because this repo already has that seam and it keeps batch operations reviewable

**If work changes live rendered fields or schema output:**

- Use WordPress PHP hooks or mu-plugins
- Because brand-page success already depends on that pattern in production

**If work changes routing behavior:**

- Use a reviewed redirect management layer plus crawl verification
- Because redirect quality is part strategy, part implementation, and cannot be safely improvised

## Version Compatibility

| Package A                | Compatible With                                | Notes                                                                        |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Node.js 20.x             | npm lockfile in repo root                      | Align new script work with the repo runtime already used by the Nuxt project |
| WordPress 6.x            | PHP 8.2+                                       | Treat this as the safe target band for new WordPress-side automation work    |
| Rank Math current stable | WordPress term metadata and template rendering | Exact production version still needs confirmation during implementation      |

## Sources

- `wordpress/docs/master-seo-plan-current.md` — current truth and quality-gate expectations
- `wordpress/docs/seo-execution-board.md` — owner model, blockers, and workstream sequencing
- `wordpress/docs/live-seo-reality-check-2026-04-07.md` — validated live-site observations
- `wordpress/scripts/` — existing automation seams already used in this repo
- `wordpress/mu-plugins/psp-brand-content-field.php` — live brand-page automation dependency

---

_Stack research for: WordPress SEO automation and content operations_
_Researched: 2026-04-07_
