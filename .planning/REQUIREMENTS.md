# Requirements: Comprehensive French Bilingual Support

**Defined:** 2026-04-09
**Core Value:** French-speaking Canadian customers see a fully localized experience across all customer-facing touchpoints. Backend order data stays English for fulfillment team clarity.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### INFRA — i18n Routing Infrastructure

- [ ] **INFRA-01**: i18n strategy switched from `no_prefix` to `prefix_except_default` — /fr/ prefix routes auto-generated
- [ ] **INFRA-02**: /fr/ route rules in nuxt.config.ts mirror English rules (prerender, cache TTL, SSR settings)
- [ ] **INFRA-03**: `<html lang>` attribute dynamically set to `fr-CA` on /fr/ routes and `en-CA` on English routes
- [ ] **INFRA-04**: /fr/ routes work with Cloudflare KV caching (same storage binding, proper key separation)
- [ ] **INFRA-05**: Existing English URLs unchanged — zero breaking changes to current SEO or bookmarks

### LOCALE — Locale File Completeness

- [ ] **LOCALE-01**: All customer-facing hardcoded strings have corresponding i18n keys in en-CA.json
- [ ] **LOCALE-02**: All new en-CA keys have fr-CA translations in fr-CA.json
- [ ] **LOCALE-03**: Home page keys: hero text, trust badge captions, FAQ Q&As, CTAs, welcome paragraph
- [ ] **LOCALE-04**: Blog chrome keys: breadcrumbs ("Home", "Blog"), "Share this article", "Tags", "About the Author", "Table of Contents", "Ready to Get Skating?" CTA
- [ ] **LOCALE-05**: Checkout/order keys: "We sent you an email confirmation", "Loading order details...", "Try Again"
- [ ] **LOCALE-06**: Search page keys: "Searching...", "results found", "No products found", "Back to home"
- [ ] **LOCALE-07**: Error message keys: checkout stock errors, payment errors, turnstile errors, form validation
- [ ] **LOCALE-08**: French text uses natural fr-CA idiom (Canadian French, not France French)

### COMP — Component Text Extraction

- [ ] **COMP-01**: BlogPost.vue — all 12+ hardcoded strings replaced with `$t()` calls
- [ ] **COMP-02**: BlogPostCard.vue — reading time, category labels use `$t()`
- [ ] **COMP-03**: CategoryContent.vue — customer-facing section titles/descriptions use `$t()`
- [ ] **COMP-04**: ProductFAQ.vue, ProductReviews.vue, ProductVideo.vue — UI chrome strings use `$t()`
- [ ] **COMP-05**: Base layer overrides (SignInLink.vue, MainMenu.vue, AppFooter.vue) copied to root `/components/` with `$t()` calls
- [ ] **COMP-06**: Accessibility text (aria-labels, `alt` text fallbacks like "Product image", "Remove Item") use `$t()`

### PAGE — Page Text Extraction

- [ ] **PAGE-01**: index.vue — hero heading, trust badge text (4 badges), FAQ (8 Q&As), CTAs, welcome paragraph all use `$t()`
- [ ] **PAGE-02**: checkout/order-received — 4 confirmation messages + loading text use `$t()`
- [ ] **PAGE-03**: contact.vue — form labels, success/error messages, turnstile error use `$t()`
- [ ] **PAGE-04**: search.vue — result count text, no-results message, loading text use `$t()`
- [ ] **PAGE-05**: checkout.vue — stock validation error, payment failure error use `$t()`
- [ ] **PAGE-06**: inline-skates-size-calculator.vue — form labels, instructions, error message use `$t()`

### SWITCH — Language Switcher

- [ ] **SWITCH-01**: Visible EN/FR toggle rendered in desktop site header
- [ ] **SWITCH-02**: Toggle also present in mobile hamburger menu / navigation drawer
- [ ] **SWITCH-03**: Switching language preserves current page path (e.g. /product/x ↔ /fr/product/x)
- [ ] **SWITCH-04**: Locale preference persisted via cookie across sessions (consumed by @nuxtjs/i18n)
- [ ] **SWITCH-05**: Active language visually indicated (bold, underlined, or highlighted)

### SEO — French SEO & Hreflang

- [ ] **SEO-01**: `useCanadianSEO()` auto-detects /fr/ prefix route and sets locale to `fr-CA`
- [ ] **SEO-02**: Every page generates hreflang `<link>` tags for en-CA, fr-CA, en-US, x-default
- [ ] **SEO-03**: French pages set `og:locale` to `fr_CA` with `og:locale:alternate` of `en_CA`
- [ ] **SEO-04**: Sitemap generation includes /fr/ alternate URLs for all indexed pages
- [ ] **SEO-05**: French pages have canonical URL pointing to their own /fr/ path
- [ ] **SEO-06**: French page `<title>` and `<meta name="description">` are in French

### EMAIL — Contact Email i18n

- [ ] **EMAIL-01**: Contact form submission includes locale indicator (from route or hidden form field)
- [ ] **EMAIL-02**: Customer confirmation email sent in French when submission locale is fr-CA
- [ ] **EMAIL-03**: Admin notification email remains English regardless of customer's locale
- [ ] **EMAIL-04**: Contact form frontend error messages use `$t()` for locale-aware display

### BLOG — Blog UI Chrome i18n

- [ ] **BLOG-01**: BlogPost.vue chrome (breadcrumbs, share, tags, author bio, TOC, CTA) uses `$t()`
- [ ] **BLOG-02**: BlogPostCard.vue (reading time label, category display) uses `$t()`
- [ ] **BLOG-03**: Blog listing/index page navigation and heading text uses `$t()`
- [ ] **BLOG-04**: Blog post Markdown content (body text) remains English — not translated

## v2 Requirements (Deferred)

Tracked for future release. Not in current roadmap.

- **V2-01**: French blog post content — create French Markdown articles in `content/blog/` with /fr/ routes
- **V2-02**: French product names/descriptions — would require WPML or similar on WordPress backend
- **V2-03**: French legal pages (terms, privacy) — requires legal review before translation
- **V2-04**: Browser language auto-detection with soft redirect prompt
- **V2-05**: French category-specific SEO descriptions in `data/category-content.ts`

## Out of Scope

| Feature | Reason |
|---------|--------|
| French product data from WPGraphQL | Backend serves English; frontend translates chrome only |
| Backend order metadata in French | Fulfillment team reads admin in English. "Backorder: Yes" stays English |
| WooCommerce admin email templates | Controlled by WordPress, not this repo |
| French subdomain (fr.proskatersplace.ca) | Using /fr/ prefix — simpler infrastructure |
| Auto-translation of user content (reviews) | Quality control issue; user content stays as submitted |
| Modifying woonuxt_base/ | Architecture rule: override by copying to root |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01..05 | Phase 1: i18n Routing Infrastructure | Pending |
| LOCALE-01..08 | Phase 2: Locale File Completion | Pending |
| COMP-01..06 | Phase 3: Component Text Extraction | Pending |
| PAGE-01..06 | Phase 4: Page Text Extraction | Pending |
| SWITCH-01..05 | Phase 5: Language Switcher | Pending |
| SEO-01..06 | Phase 6: French SEO & Hreflang | Pending |
| EMAIL-01..04 | Phase 7: Contact Email i18n | Pending |
| BLOG-01..04 | Phase 8: Blog UI Chrome i18n | Pending |

**Coverage:**

- v1 requirements: 44 total
- Mapped to phases: 44 ✓
- Unmapped: 0

---

_Requirements defined: 2026-04-09_
_Last updated: 2026-04-09 after initialization_
