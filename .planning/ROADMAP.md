# Roadmap: Comprehensive French Bilingual Support

## Overview

This roadmap delivers true French Canadian bilingual support for ProSkaters Place Canada — transforming the site from English-only to a fully localized EN/FR experience. The build follows a strict dependency chain: routing infrastructure → locale data → text extraction → UI controls → SEO — ensuring each phase has verified foundations before building on them.

Customer-facing text gets French translations. Backend order metadata stays English for fulfillment team clarity.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: i18n Routing Infrastructure** — Switch from no_prefix to prefix_except_default strategy, /fr/ route rules, dynamic html lang
- [ ] **Phase 2: Locale File Completion** — Add ~60+ new i18n keys to en-CA.json and fr-CA.json for all hardcoded strings
- [ ] **Phase 3: Component Text Extraction** — Replace hardcoded English in all customer-facing components with $t() calls
- [ ] **Phase 4: Page Text Extraction** — Replace hardcoded English on all pages (home, checkout, contact, search, calculator)
- [ ] **Phase 5: Language Switcher** — Visible EN/FR toggle in header and mobile menu with route-aware navigation
- [ ] **Phase 6: French SEO & Hreflang** — Wire useCanadianSEO() for /fr/ detection, hreflang tags, sitemap alternates
- [ ] **Phase 7: Contact Email i18n** — Locale-aware contact form email (French confirmation for French submissions)
- [ ] **Phase 8: Blog UI Chrome i18n** — Translate BlogPost/BlogPostCard surrounding UI while keeping English content

## Phase Details

### Phase 1: i18n Routing Infrastructure

**Goal**: /fr/ prefix routes exist and work with the same caching/SSR behaviour as English routes
**Depends on**: Nothing (foundation phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):

1. Visiting /fr/ renders the home page with fr-CA locale active
2. Visiting /fr/product/any-slug renders the product page with fr-CA locale
3. `<html lang="fr-CA">` is set on /fr/ pages, `<html lang="en-CA">` on English pages
4. /fr/ pages are cached in Cloudflare KV with same TTL rules as English equivalents
5. Existing English URLs (/, /product/x, /blog/x) continue to work unchanged

**Plans:** 1 plan

Plans:

- [ ] 01-01-PLAN.md — Establish `/fr` routing, dynamic `<html lang>`, and French route-rule parity without breaking English URLs

### Phase 2: Locale File Completion

**Goal**: Every customer-facing string in the app has an i18n key with both English and French translations
**Depends on**: Nothing (can parallelize with Phase 1)
**Requirements**: LOCALE-01, LOCALE-02, LOCALE-03, LOCALE-04, LOCALE-05, LOCALE-06, LOCALE-07, LOCALE-08
**Success Criteria** (what must be TRUE):

1. en-CA.json contains keys for ALL strings currently hardcoded in components/pages
2. fr-CA.json contains French translations for ALL those same keys
3. French text reads naturally as Canadian French (reviewed for idiom, not machine-translated)
4. No duplicate or conflicting keys between new additions and existing locale entries

**Plans:** TBD

### Phase 3: Component Text Extraction

**Goal**: All customer-facing Vue components render text via $t() — language switches instantly without page reload
**Depends on**: Phase 2 (locale keys must exist)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06
**Success Criteria** (what must be TRUE):

1. BlogPost.vue renders all UI chrome in French when locale is fr-CA
2. SignInLink.vue, MainMenu.vue, AppFooter.vue overrides in root `/components/` use $t()
3. ProductFAQ, ProductReviews, ProductVideo UI labels use $t()
4. Zero hardcoded English strings remain in any customer-facing component template
5. Accessibility attributes (aria-label, alt) use $t()

**Plans:** TBD

### Phase 4: Page Text Extraction

**Goal**: All page-level content renders via $t() — French visitors see French text on every page
**Depends on**: Phase 2 (locale keys must exist)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06
**Success Criteria** (what must be TRUE):

1. index.vue renders hero, trust badges, FAQ, CTAs, and welcome text in French when locale is fr-CA
2. Order confirmation page shows French messages when locale is fr-CA
3. Contact, search, and checkout pages show French error messages when locale is fr-CA
4. Size calculator page labels and instructions are in French when locale is fr-CA
5. No hardcoded English strings remain in any page template

**Plans:** TBD

### Phase 5: Language Switcher

**Goal**: Users can toggle between English and French from any page
**Depends on**: Phase 1 (routes must exist), Phase 3 or 4 (text must be translatable)
**Requirements**: SWITCH-01, SWITCH-02, SWITCH-03, SWITCH-04, SWITCH-05
**Success Criteria** (what must be TRUE):

1. EN/FR toggle visible in desktop header
2. EN/FR toggle visible in mobile navigation menu
3. Clicking FR on /product/some-skate navigates to /fr/product/some-skate
4. Clicking EN on /fr/product/some-skate navigates to /product/some-skate
5. Locale preference persists across page reloads (cookie-based)
6. Active language is visually distinct from inactive option

**Plans:** TBD

### Phase 6: French SEO & Hreflang

**Goal**: French pages are SEO-optimized with proper hreflang, canonicals, and sitemap entries for Google indexing
**Depends on**: Phase 1 (routes), Phase 4 (French meta text available)
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06
**Success Criteria** (what must be TRUE):

1. useCanadianSEO() returns fr-CA locale when route starts with /fr/
2. Every page has `<link rel="alternate" hreflang="fr-CA">` and `<link rel="alternate" hreflang="en-CA">` tags
3. French pages have `<meta property="og:locale" content="fr_CA">`
4. /api/sitemap.xml includes /fr/ alternate URLs for all indexed routes
5. French pages have canonical URL pointing to /fr/ path (not English path)

**Plans:** TBD

### Phase 7: Contact Email i18n

**Goal**: French-speaking customers receive contact form confirmation in French
**Depends on**: Phase 1 (locale detection via route)
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Success Criteria** (what must be TRUE):

1. Contact form submitted from /fr/contact sends French confirmation email to customer
2. Admin notification email remains in English regardless of submission locale
3. Contact form error messages display in French when locale is fr-CA
4. Submission includes locale field so server can determine language

**Plans:** TBD

### Phase 8: Blog UI Chrome i18n

**Goal**: Blog post pages show French UI chrome (breadcrumbs, share, tags, TOC) while blog content stays English
**Depends on**: Phase 2 (locale keys), Phase 3 (component extraction patterns established)
**Requirements**: BLOG-01, BLOG-02, BLOG-03, BLOG-04
**Success Criteria** (what must be TRUE):

1. BlogPost.vue breadcrumbs read "Accueil > Blogue" when locale is fr-CA
2. "Share this article" / "Tags" / "About the Author" / "Table of Contents" labels are French
3. BlogPostCard reading time shows "min de lecture" instead of "min read"
4. Blog post body content (Markdown) remains in English — only surrounding chrome is translated

**Plans:** TBD

## Progress

**Execution Order:**

Phases 1 and 2 can parallelize (no dependency). Phase 3 and 4 can parallelize after Phase 2.
Phase 5 requires Phase 1 + (3 or 4). Phase 6 requires Phase 1 + 4. Phase 7 requires Phase 1.
Phase 8 requires Phase 2 + 3.

```
Phase 1 (routing) ─────┬──→ Phase 5 (switcher) ──→ Phase 6 (SEO)
                        │                            ↑
Phase 2 (locale keys) ──┼──→ Phase 3 (components) ──┤
                        │                            │
                        └──→ Phase 4 (pages) ────────┘

Phase 1 ──→ Phase 7 (email)
Phase 2 + 3 ──→ Phase 8 (blog chrome)
```

| Phase                          | Plans Complete | Status      | Completed |
| ------------------------------ | -------------- | ----------- | --------- |
| 1. i18n Routing Infrastructure | 0/1            | Not started | —         |
| 2. Locale File Completion      | 0/?            | Not started | —         |
| 3. Component Text Extraction   | 0/?            | Not started | —         |
| 4. Page Text Extraction        | 0/?            | Not started | —         |
| 5. Language Switcher           | 0/?            | Not started | —         |
| 6. French SEO & Hreflang       | 0/?            | Not started | —         |
| 7. Contact Email i18n          | 0/?            | Not started | —         |
| 8. Blog UI Chrome i18n         | 0/?            | Not started | —         |
