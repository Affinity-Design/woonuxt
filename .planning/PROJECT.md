# Comprehensive French Bilingual Support

## What This Is

A complete bilingual (EN/FR) transformation of the ProSkaters Place Canada frontend — delivering true French Canadian customer experience across all customer-facing touchpoints while preserving English admin/backend metadata for order fulfillment clarity.

## Core Value

French-speaking Canadian customers see a fully localized experience — navigation, product chrome, checkout flow, emails, and SEO — in natural fr-CA French. Backend order data remains English so the fulfillment team reads orders without translation friction.

## Requirements

### Validated

- ✓ `@nuxtjs/i18n` module already installed and configured in nuxt.config.ts — existing
- ✓ `locales/fr-CA.json` exists with ~80% of base WooNuxt keys translated — existing
- ✓ `locales/en-CA.json` complete with all base keys + custom keys — existing
- ✓ `i18n.config.ts` defines fr-CA in fallback chain — existing
- ✓ `useCanadianSEO()` composable already has locale param, hreflang skeleton, and `detectLocale()` — existing
- ✓ `formatCADPrice()` supports fr-CA formatting (`123,45 $`) — existing
- ✓ Vue i18n `$t()` available in all components via module auto-import — existing

### Active

**Infrastructure (Phase 1):**

- [ ] Switch i18n strategy from `no_prefix` to `prefix_except_default` for /fr/ route generation
- [ ] Add /fr/ prefix route rules (prerender, cache, SSR settings) mirroring English routes
- [ ] Dynamic `lang` attribute on `<html>` — `en-CA` or `fr-CA` based on active locale
- [ ] Ensure /fr/ routes work with existing Cloudflare KV caching and prerendering

**Locale Completeness (Phase 2):**

- [ ] Audit all hardcoded customer-facing strings and create matching i18n keys
- [ ] Add ~60+ new keys to both en-CA.json and fr-CA.json for currently-hardcoded text
- [ ] Ensure fr-CA.json covers: home page, blog chrome, checkout, order confirmation, search, contact, size calculator, error messages
- [ ] Ensure natural fr-CA phrasing (not Google Translate quality)

**Component Extraction (Phase 3):**

- [ ] Replace all hardcoded English in `/components/` with `$t()` calls
- [ ] Key targets: BlogPost.vue, BlogPostCard.vue, CategoryContent.vue, ProductFAQ.vue, ProductReviews.vue
- [ ] Override base layer components (SignInLink, MainMenu, AppFooter) to use $t() where needed
- [ ] Ensure aria-labels and alt text use $t() for accessibility

**Page Extraction (Phase 4):**

- [ ] Replace hardcoded English on index.vue (hero, trust badges, FAQ, CTAs, welcome text)
- [ ] Replace hardcoded English on checkout/order-received (confirmation messages)
- [ ] Replace hardcoded English on contact.vue, search.vue, size calculator
- [ ] Replace hardcoded error messages on checkout.vue

**Language Switcher (Phase 5):**

- [ ] Visible EN/FR toggle in site header
- [ ] Route-aware: switches between /page and /fr/page while preserving path
- [ ] Persist locale preference (cookie or localStorage)
- [ ] Works on mobile menu as well as desktop header

**French SEO & Hreflang (Phase 6):**

- [ ] Wire useCanadianSEO() to detect /fr/ prefix and set locale automatically
- [ ] Generate proper hreflang link tags on all pages (en-CA, fr-CA, en-US, x-default)
- [ ] French pages get `og:locale` = `fr_CA`, title/description in French
- [ ] Update sitemap generation to include /fr/ alternate URLs
- [ ] French canonical URLs (https://proskatersplace.ca/fr/...)

**Contact Email i18n (Phase 7):**

- [ ] Detect submission locale from route or form data
- [ ] French confirmation email text for French-context submissions
- [ ] Admin notification email stays English (internal use)
- [ ] Error messages on contact form use $t()

**Blog UI Chrome i18n (Phase 8):**

- [ ] BlogPost.vue: breadcrumbs, "Share this article", "Tags", "About the Author", "Table of Contents", "Ready to Get Skating?" CTA
- [ ] BlogPostCard.vue: reading time, category labels
- [ ] Blog listing page navigation text
- [ ] Keep actual blog post content in English (French content is out of scope)

### Out of Scope

- French blog post content (Markdown articles stay English for now)
- French product names/descriptions in WooCommerce backend (stays English — WPGraphQL returns English)
- Backend order metadata (line item meta, order notes) — stays English for fulfillment team clarity
- Admin-facing server logs and error messages — English only
- WooCommerce admin email templates — controlled by WordPress, not this repo
- French subdomain (fr.proskatersplace.ca) — using /fr/ prefix instead
- Auto-translating user-generated content (reviews, order notes from customers)
- French versions of static legal pages (terms, privacy) — separate legal review needed

## Context

- **Current state**: i18n module installed with `no_prefix` strategy. fr-CA.json has base WooNuxt keys but frontend has 60+ hardcoded English strings. No /fr/ routes exist. No language switcher.
- **Backend boundary**: WordPress/WooCommerce data (product names, descriptions, categories) comes through in English via WPGraphQL. This initiative does NOT translate backend data — it translates the site chrome, navigation, checkout flow, and SEO markup around that English product data.
- **Admin clarity rule**: Order metadata (line item meta like "Backorder: Yes", order notes listing SKUs) MUST stay English so the fulfillment team in the admin dashboard can read what was ordered without needing translation.
- **SEO alignment**: This directly supports the .ca bilingual SEO vision — Google indexes /fr/ pages separately, hreflang tags connect EN↔FR alternates, French pages rank for French Canadian search queries.
- **Architecture constraint**: `woonuxt_base/` is read-only. Override components by copying to root `/components/`.
- **Caching**: /fr/ routes need the same Cloudflare KV + prerender treatment as English routes.

## Constraints

- **Architecture**: Must not modify `woonuxt_base/`. Override by copying files to root.
- **Backend data**: Product names, descriptions, categories remain English from WPGraphQL.
- **Order metadata**: All order notes, line item meta, admin-facing text stays English.
- **Quality**: French translations must be natural fr-CA (Canadian French), not France French.
- **Performance**: /fr/ routes must have same caching/prerender treatment as English.
- **SEO**: Every /fr/ page must have correct hreflang pointing to English equivalent and vice versa.

## Key Decisions

| Decision                                   | Rationale                                                                                                        | Status     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `/fr/` prefix routing (not subdomain)      | Simpler infrastructure, single Cloudflare Pages deployment, @nuxtjs/i18n native support                          | ✅ Decided |
| `prefix_except_default` strategy           | English stays at root paths, French gets /fr/ prefix — no breaking URL changes for existing English SEO          | ✅ Decided |
| Blog content stays English                 | French blog content requires separate editorial pipeline; translate UI chrome only for now                       | ✅ Decided |
| Contact form email only (not order emails) | Order emails are WooCommerce-controlled; contact.ts is the only email we fully control                           | ✅ Decided |
| Header language toggle (EN/FR)             | Users need explicit control; browser detection alone isn't sufficient for bilingual regions                      | ✅ Decided |
| Order metadata stays English               | Fulfillment team reads admin dashboard in English; translating "Backorder: Yes" to "En rupture" causes confusion | ✅ Decided |
| Product data stays English from API        | WPGraphQL returns English product data; frontend translates chrome around it, not product content                | ✅ Decided |

## Evolution

This document evolves at phase transitions and milestone boundaries. 5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-09 after initialization_
