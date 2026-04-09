# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** French-speaking Canadian customers see a fully localized experience. Backend order data stays English for fulfillment team clarity.
**Current focus:** Milestone initialized — ready to plan Phase 1

## Current Position

Phase: 0 of 8 (none started)
Plan: None yet
Status: Planning
Last activity: 2026-04-09 — Milestone created with 8 phases, 44 requirements

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Status      |
| ----- | ----- | ----------- |
| 1     | 0     | Not started |
| 2     | 0     | Not started |
| 3     | 0     | Not started |
| 4     | 0     | Not started |
| 5     | 0     | Not started |
| 6     | 0     | Not started |
| 7     | 0     | Not started |
| 8     | 0     | Not started |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Routing]: `prefix_except_default` strategy — English at root, French at /fr/ prefix
- [Scope]: Blog content stays English; only UI chrome gets translated
- [Scope]: Contact form email is the only email we translate (WC order emails controlled by WordPress)
- [Scope]: Backend order metadata stays English for fulfillment team
- [UI]: Header language toggle (EN/FR) for explicit user control
- [SEO]: /fr/ pages indexed separately by Google, connected via hreflang to English equivalents

### Codebase Audit Findings

From pre-milestone audit:

- **60+ hardcoded English strings** across components and pages
- Current i18n strategy is `no_prefix` — must switch to `prefix_except_default`
- fr-CA.json has ~80% of base WooNuxt keys but is missing all custom strings
- `useCanadianSEO()` has locale param and hreflang skeleton but not fully wired for /fr/ routes
- No /fr/ route rules exist in nuxt.config.ts
- No language switcher component exists
- Key hotspots: BlogPost.vue (12+ strings), index.vue (15+ strings), order-received (4 strings)

### Pending Todos

None yet.

### Blockers/Concerns

- Verify @nuxtjs/i18n `prefix_except_default` doesn't break existing English route cache keys in Cloudflare KV
- Verify Cloudflare Pages handles /fr/ static prerendering correctly (route generation may need updates)
- Canadian French quality — machine translation is insufficient; need human-quality fr-CA idiom

### Previous Milestone

Backorder & Condition-Based Cart/Checkout Notices — Completed 2026-04-09
See: .planning/archive/milestone-1-backorder-notices/

## Session Continuity

Last session: 2026-04-09
Stopped at: Milestone created, ready to plan Phase 1
Resume file: None
