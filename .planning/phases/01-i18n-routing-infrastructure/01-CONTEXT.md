# Phase 1: i18n Routing Infrastructure - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Source:** Autonomous smart discuss (infrastructure phase)

<domain>
## Phase Boundary

Switch Nuxt i18n from `no_prefix` to `prefix_except_default` strategy, generating `/fr/...` French routes alongside existing unprefixed English routes. Wire dynamic `<html lang>` from locale state. Mirror all English caching, prerender, and SSR route rules onto French-prefixed equivalents.

</domain>

<decisions>
## Implementation Decisions

### Agent's Discretion

All implementation choices are at the agent's discretion — pure infrastructure phase.

Key constraints from PROJECT.md and ROADMAP.md:

- Strategy: `prefix_except_default` — English at root, French at /fr/ prefix
- Routed locales: `en-CA` (default, unprefixed) and `fr` (prefixed, iso fr-CA)
- Existing English URLs must remain unchanged (INFRA-05)
- French route rules must mirror English caching/SSR behavior (INFRA-04)
- `<html lang>` must be dynamic: en-CA for English, fr-CA for French (INFRA-03)

</decisions>

<code_context>

## Existing Code Insights

### Reusable Assets

- `useCanadianSEO()` already detects `/fr` prefix in route path → returns `fr-CA`
- `i18n.config.ts` already has `fr` fallback chain → `['en-CA', 'en']`
- Locale files exist on disk: `en-CA.json`, `fr-CA.json`, `en.json`, `en-US.json`

### Established Patterns

- Route rules defined in `nuxt.config.ts` with `routeRules` object
- Prerender routes built from JSON data files (`blog-routes.json`, `category-routes.json`, `product-routes.json`)
- Blog redirects loaded from `blog-redirects.json`
- Client-only routes: `/checkout/**`, `/cart`, `/my-account/**`

### Integration Points

- `nuxt.config.ts` — i18n config, routeRules, nitro.prerender.routes
- `i18n.config.ts` — Vue I18n runtime config
- `app.vue` — `useHead()` for html lang attribute
- `useLocaleHead()` — Nuxt i18n composable for locale-aware head tags

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 01-i18n-routing-infrastructure_
_Context gathered: 2026-04-13 via Autonomous Smart Discuss (infrastructure)_
