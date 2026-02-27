# SEO Audit Report: ProSkaters Place

**URL:** https://proskatersplace.com  
**Date:** February 25, 2026  
**Overall Score:** 62/100 — Needs Work  
**Domain Status:** Established (indexed since ~2020, logo refresh Jan 2026)  
**Data Sources:** Live site crawl + 1,000-keyword Semrush export (US, Feb 25 2026)

---

## Executive Summary

ProSkaters Place has built a solid SEO foundation with 1,000 tracked keywords, a healthy median ranking of position 7, and 336 keywords in the top-3 — impressive for a niche specialty retailer. However, the site is leaving enormous traffic on the table: its single most important commercial keyword, **"roller skates" (60,500 monthly searches), sits at position #47**, and multiple high-volume commercial terms are incorrectly mapped to informational article pages instead of product pages. Fixing intent mismatches, plugging the structural technical gaps, and investing in AI/GEO readiness represent the three highest-leverage opportunities.

---

## Scores by Category

| Category             | Score | Status        | Key Signal                                    |
| -------------------- | ----- | ------------- | --------------------------------------------- |
| Domain / History     | 8/10  | ✅ Good       | Established domain, trust building            |
| Technical SEO        | 9/15  | ⚠️ Needs Work | Broken links, schema gaps, inconsistencies    |
| Content Quality      | 16/25 | ⚠️ Needs Work | Good blog volume, thin category pages         |
| Keyword Optimization | 6/10  | ⚠️ Needs Work | Intent mismatches, position-47 disaster       |
| E-E-A-T Signals      | 12/20 | ⚠️ Needs Work | Reviews present, no author attribution        |
| AI / GEO Readiness   | 5/10  | ❌ Critical   | 23% AI Overview exposure, poor extractability |
| User Behavior        | 6/10  | ⚠️ Needs Work | Shipping CTA inconsistency hurts conversion   |

**Total: 62/100**

---

## Pipeline Bottleneck Analysis

```
Mustang ✅ → Topicality ⚠️ → NavBoost ⚠️ → Twiddlers ❌
  Quality OK    Intent gaps    CTR mismatch   AI Overview lost
```

The site clears Mustang's quality gate comfortably — it's an established domain with real content. The primary blockers are at the **Topicality** stage (wrong pages ranking for wrong queries) and **Twiddlers** (AI Overview displacement on 238 keywords). NavBoost is partially working given the strong positions on long-tail terms, but the high bounce risk from intent-mismatched pages is likely suppressing it on key commercial terms.

---

## Priority Issues (Fix First)

1. **"Roller skates" at position #47** — Impact: Critical | Fix: Build a dedicated `/shop/roller-skates/` hub page with full category content, buying guide, and schema | Signal: titlematchScore, siteAuthority

2. **Commercial keywords driving to informational pages** — "roller blades" (22,200 vol, pos 4) and "roller skate" (12,100 vol, pos 5) both route to `/how-much-does-roller-skating-cost/` — an article, not a shop page. Impact: High | Fix: Redirect or create dedicated transactional pages and signal them via internal links | Signal: Topicality, NavBoost

3. **Inconsistent free shipping threshold** — Homepage says "Free US Shipping Over $150" while inline skates category and shop pages say "Free Shipping Over $99". Impact: High (destroys trust, increases bounce) | Fix: Audit and standardize site-wide; update all templates

4. **23% of keywords have AI Overviews — site is not cited** — 238 queries where Google is surfacing its own answer instead of a click. Impact: High | Fix: Add structured FAQ + HowTo schema; rewrite article openings with direct inverted-pyramid answers | Signal: AI extractability

5. **Broken internal link in footer** — `"products/skaterboards-and-longboards/"` (typo) | Fix: Correct to `/products/skateboards-and-longboards/` across all templates | Signal: Internal link equity loss

---

## Domain Context

ProSkaters Place is an established WooCommerce store, Canadian-operated (Toronto warehouse) with a US-first SEO strategy. Search results show indexation dating to December 2020, giving it solid domain age. The January 2026 logo upload suggests a recent refresh but not a full rebrand. URL structure is mostly evergreen and clean. The `siteAuthority` signal appears healthy given 336 top-3 rankings, but is being capped by the content quality issues on category pages.

**Important brand note:** The site's "About" page claims "North America's #1 skate shop" with 450+ five-star reviews. This trust language should be surfaced more prominently on product and category pages, not just the About page.

---

## Technical SEO Findings

**What's working:**

- HTTPS enabled ✓
- Clean URL structure (e.g., `/shop/inline-skating/inline-skates/[product-name]/`) ✓
- Mobile-friendly design ✓
- Contact page with email address and response policies ✓
- Sitelinks appearing in 919/1000 keywords — Google recognizes site structure ✓
- Blog articles appear to have open graph tags ✓

**Issues found:**

**Broken internal link (Footer):** The footer navigation contains `/products/skaterboards-and-longboards/` (note the typo "skaterboards"). This same malformed URL appears in the body copy of the homepage: _"we specialize in quality Inline and Roller Skates, Kick Scooters, Skateboards…"_ — the anchor points to the wrong URL. This quietly bleeds internal PageRank and creates crawl errors.

**Shipping threshold inconsistency:** The homepage header reads "Free US Shipping Over $150" while inline skate category pages and the shop page advertise "Free Shipping Over $99." This is both a trust issue and a potential technical issue if multiple canonical versions of promotional copy are indexed. It also likely inflates bounce rate from users who click through expecting different offers.

**Schema markup gaps:** No visible Product schema, ReviewAggregate schema, or Organization schema was detected on the homepage or category pages. Given that "Popular products" SERP features appear in 615 of the site's 1,000 tracked keywords, structured data could dramatically improve rich result capture rates. The FAQ section on the homepage also lacks FAQPage schema, missing the corresponding rich result opportunity.

**Homepage title tag:** "Best Inline Skates & Roller Skates | ProSkaters Place USA" — this is 58 characters, acceptable, but front-loads "Best" over a core keyword. More impactful would be "Inline Skates & Roller Skates | ProSkaters Place USA Shop" to keep transactional intent visible.

**Homepage H1:** The rendered H1 is "ProSkaters Place" — a pure brand-only H1. This misses the strongest on-page keyword signal slot entirely. Given that "roller skates" at 60,500/mo is position 47, the site's authority page (homepage) should have a clear, keyword-rich H1.

**Duplicate FAQ content:** "Are roller skates better tight or loose?" appears twice in the homepage FAQ section. Duplicate content within a page suppresses the `contentEffort` signal for that section.

**Image optimization signals:** Product thumbnails are all 300×300 with descriptive filenames — this is good. However, alt text for brand logos in the "Brands We Carry" section is generic (e.g., "Home 1", "Home 2") and misses brand entity association opportunities.

---

## Content Quality Findings

**Blog content — strong volume, weak conversion architecture:** The content section is active (6 articles visible on homepage, dated late 2025) and generating real traffic. The `/how-much-does-roller-skating-cost/` article is the #2 traffic page on the entire site (796 estimated monthly visits). However, articles lack visible author attribution (no byline name, no author bio), which directly impacts `OriginalContentScore` and E-E-A-T evaluation.

**Category page depth — mixed:** The inline skates category page (`/products/inline-skating/inline-skates/`) and the `/shop/inline-skates/` hub page have solid descriptive content explaining skate types, brand overviews, and FAQs. This is why the site ranks reasonably for "inline skates" (pos 14). However, the roller skates category appears shallower, consistent with the catastrophic "roller skates" position #47 gap.

**Content duplication across category pages:** The same FAQ block ("Is there a difference between rollerblades and inline skates?") appears verbatim on the homepage, the inline skating category page, and the inline skates product category page. Google's duplicate content filters will dilute the value of this FAQ across all three pages rather than concentrating authority on one.

**Freshness:** Articles use explicit dates (October–November 2025) which is good for `semanticDate`. Product pages are undated (appropriate for evergreen commerce). The logo upload (January 2026) suggests ongoing maintenance which is a positive freshness signal.

**Thin product pages concern:** Based on the site structure observed, individual product pages (e.g., specific skate models) are likely template-driven with manufacturer descriptions. If these descriptions are not unique, Google's `OriginalContentScore` will flag hundreds of near-duplicate pages — a common WooCommerce problem that creates broad dilution of domain authority.

---

## Keyword Analysis

**Portfolio snapshot (1,000 keywords, US):**

| Metric                 | Value     |
| ---------------------- | --------- |
| Total keywords tracked | 1,000     |
| Median position        | 7.0       |
| Average position       | 19.1      |
| Positions 1–3          | 336 (34%) |
| Positions 4–10         | 257 (26%) |
| Positions 11–20        | 99 (10%)  |
| Positions 21+          | 308 (31%) |

**The biggest missed opportunity in the entire dataset:**

"roller skates" — 60,500 monthly searches, position 47, KD 68. The site ranks for hundreds of long-tail roller skate terms but the head term is essentially invisible. The inline skates equivalent pages outperform the roller skates pages consistently, suggesting the roller skating section of the site has a content depth deficit.

**Critical intent mismatches — pages ranking for the wrong query type:**

| Keyword       | Volume | Position | URL Ranking                         | Problem                               |
| ------------- | ------ | -------- | ----------------------------------- | ------------------------------------- |
| roller blades | 22,200 | 4        | /how-much-does-roller-skating-cost/ | Commercial query → informational page |
| roller skate  | 12,100 | 5        | /how-much-does-roller-skating-cost/ | Commercial query → informational page |
| rollerblade   | 9,900  | 23       | Mixed                               | Brand-name query under-served         |
| penny board   | 18,100 | 30       | Unknown                             | High-volume term far off page 1       |

When Google ranks an article about "how much does roller skating cost" for the query "roller blades," it's because the site lacks a stronger transactional candidate. Users searching "roller blades" almost certainly want to buy them — high bounce rate is guaranteed, which NavBoost will penalize over time.

**Low-hanging fruit — positions 4–20 with meaningful volume:**

| Keyword               | Position | Volume | KD  | Priority                 |
| --------------------- | -------- | ------ | --- | ------------------------ |
| roller blades         | 4        | 22,200 | 36  | 🔥 Critical — fix intent |
| inline skates         | 14       | 14,800 | 36  | High                     |
| roller skate          | 5        | 12,100 | 61  | 🔥 Critical — fix intent |
| quad skates           | 5        | 4,400  | 63  | High                     |
| speed skates          | 5        | 4,400  | 26  | Medium                   |
| roller skate wheels   | 4        | 2,400  | 20  | Medium                   |
| womens roller skates  | 5        | 2,400  | 19  | Medium                   |
| roller blades near me | 9        | 1,900  | 28  | Medium                   |
| inline skating        | 12       | 2,900  | 38  | Medium                   |
| blades roller         | 16       | 3,600  | 31  | Medium                   |

**Intent distribution:**

| Intent        | Keywords  |
| ------------- | --------- |
| Commercial    | 442 (44%) |
| Informational | 403 (40%) |
| Transactional | 284 (28%) |
| Navigational  | 124 (12%) |

The high informational percentage is partly driven by the blog content strategy (which is working for traffic), but the site needs to ensure commercial intent traffic routes to commercial pages.

**Keyword cannibalisation detected:** "roller blades" appears twice in the top 15 by volume — at position 4 AND position 38. Two different URLs appear to be competing for the same term, splitting authority and preventing either from fully capitalising on the search volume.

**Unexpected traffic outlier:** "jock female" at position 1 (1,300 vol, 53 traffic) routing to a Stanley VGuard Hockey Female Jock Strap product page. This is an anatomically non-standard query for which the site happens to rank #1. While the traffic is real, this page likely has extremely high bounce rates from non-buyers, which generates NavBoost negative signals for that URL.

---

## E-E-A-T Assessment

**Trust signals — present:**

- Contact page with real email address (info@proskatersplace.com) ✓
- Physical warehouse location implied (Toronto) ✓
- "450+ five-star reviews" claimed on About page ✓
- Return policy, exchange policy, sizing help documented ✓
- 10% military/first-responder discount program (community signal) ✓
- Inline skate customization service (unique, expert signal) ✓
- Price match guarantee documented ✓

**Experience signals — weak:**

- No visible author names on any blog articles. All content appears staff-written but uncredited. This is a significant `OriginalContentScore` and E-E-A-T gap — Google cannot establish author entity associations.
- No "About the author" bios linking authors to skating credentials.
- No first-person skating experience documented in guides (articles use generic "you" language rather than first-person expert voice).

**Authority signals — moderate:**

- Authorized retailer for major brands (Powerslide, Rollerblade, FR Skates, etc.) — this is valuable but not explicitly stated on product pages with "Authorized Dealer" language.
- No external citations or links to industry bodies, safety standards, or governing organizations in content.
- No press coverage, media mentions, or industry award callouts visible.

**Disconnected entity risk — moderate:** The brand is clearly a real business (warehouse, policies, email), but the absence of any named human faces, staff bios, or author attributions creates a "faceless" quality that algorithmic trust systems flag. Adding even one named expert (e.g., "John Smith, ProSkaters senior buyer") as an article author would materially improve signals.

---

## AI Visibility Assessment (GEO Readiness)

**Score: 5/10 — Critical Gap**

238 of the site's 1,000 tracked keywords (23%) trigger an AI Overview in Google. This is a major concern because AI Overviews suppress organic click-through rates by 20–40% for affected queries, and the site currently has no structured strategy to be cited within those overviews.

**What's working:** The FAQ section on the homepage is well-structured with question-and-answer format. The inline skates explanation ("Is there a difference between rollerblades and inline skates?") is a direct, factual answer that is the type of content AI systems prefer to cite.

**What's missing:**

- No FAQPage or HowTo schema markup — the FAQ content exists but isn't machine-readable for AI extraction
- Article introductions use curiosity/teaser framing ("Curious about what to wear when rollerskating?") rather than inverted pyramid direct answers. AI systems prefer content that answers the question in the first two sentences, not after a hook
- No cited statistics or sourced data points in content — AI systems heavily favor quantified, attributable claims
- No comparison tables on category pages — tables are highly extractable by LLMs and appear in AI citations frequently
- Blog articles lack a TL;DR or key takeaway summary in the first 100 words

**Specific recommendations for AI citation:**

- Add a "Quick Answer" box at the top of each article with a 2-sentence direct answer
- Implement FAQPage schema across all FAQ content
- Rewrite article openings: "Off-road rollerblades use 100–150mm air-filled or large rubber wheels designed for gravel, grass, and trails" (fact-first) vs. "Ready to explore trails beyond the pavement?" (hook-first, AI-unfriendly)
- Add comparison tables to key category pages (e.g., "Inline Skates vs. Roller Skates: Key Differences")

---

## User Behavior Optimization

**Click quality — mixed:**

The site benefits from Sitelinks appearing for 919 keywords (92% of the tracked portfolio), indicating Google's strong structural understanding of the site. "Popular products" features appear for 615 keywords — excellent for a commerce site, suggesting product schema may partially exist even if not confirmed.

**High-risk bounce scenarios:**

1. A user searches "roller blades" expecting to shop → arrives at a cost article → bounces immediately. This scenario plays out ~244 times per month and is directly visible in the data (the article is getting most of the "roller blades" traffic). Over 13 months, NavBoost will suppress this keyword further.
2. The shipping threshold inconsistency ($150 on homepage, $99 on category pages) creates friction and distrust for returning visitors who notice the discrepancy.
3. The "jock female" traffic (53 visits/month to a hockey jock strap page) is almost certainly generating extreme bounce signals.

**Dwell time opportunities:**

- The inline skates hub page (`/shop/inline-skates/`) has deep buying guide content — this is good for dwell time. Replicating this structure for roller skates is a priority.
- Blog articles appear long-form, which supports dwell time — but the click-bait article titles ("Curious how rollerblades speed skates can help you reach pro-level velocity?") may attract low-intent clicks that then bounce.

**Video SERP feature:** Videos appear in 969/1,000 tracked keywords (97%). This is an enormous signal that YouTube content would directly complement the site's rankings. No YouTube presence was identifiable on the homepage. A YouTube channel featuring product reviews, how-to guides, and skate comparisons would generate video SERP placements and feed NavBoost positive signals.

---

## Action Plan

### Immediate (This Week)

- [ ] Fix the broken footer link: `skaterboards-and-longboards` → `skateboards-and-longboards` across all page templates
- [ ] Standardize the free shipping threshold across all pages (decide: $99 or $150) and update every template, header, banner, and email
- [ ] Remove the duplicate FAQ entry ("Are roller skates better tight or loose?" appears twice on homepage)
- [ ] Fix brand logo alt text from "Home 1, Home 2…" to actual brand names ("Powerslide logo", "FR Skates logo")
- [ ] Add "Authorized Retailer" language to major brand product pages

### Short-Term (This Month)

- [ ] **Build a dedicated roller skates hub page** (equivalent depth to the inline skates hub at `/shop/inline-skates/`) targeting "roller skates" and close variants. This is the single highest-ROI task in the entire audit.
- [ ] **Fix the intent mismatch** for "roller blades" and "roller skate": either (a) build a `/shop/roller-blades/` transactional page that outranks the article for these terms, or (b) add a prominent "Shop Roller Blades" product grid component at the top of the cost article above the informational content
- [ ] **Add author bylines and bios** to all blog articles. Create author profile pages linking each writer to their skating credentials.
- [ ] **Implement FAQPage schema** on the homepage FAQ section and on all article pages
- [ ] **Implement Product and AggregateRating schema** across product pages (WooCommerce schema plugins can automate this)
- [ ] **Add "Quick Answer" summary boxes** to the top of each blog article (2 sentences, fact-first, AI-extractable)
- [ ] **Deepen the roller skates category pages** with buying guides, brand comparisons, and FAQ sections matching the quality of the inline skates section
- [ ] **Address keyword cannibalization** for "roller blades" — consolidate ranking signals to one URL

### Medium-Term (Next Quarter)

- [ ] **Launch YouTube channel** with product reviews and how-to videos. With video appearing in 97% of tracked queries, this is a major untapped multiplier.
- [ ] **Build comparison tables** on category pages ("Inline Skates vs. Roller Skates," "Aggressive vs. Fitness Skates") — these are highly AI-extractable and generate backlinks
- [ ] **Target penny board opportunity**: 18,100 monthly searches, currently at position 30 — deep content for this category could move it to page 1
- [ ] **Address roller skate store local SEO**: 170 keywords trigger local packs. Consider Google Business Profile optimization to capture "roller skates near me" and "roller skate store near me" (1,900 vol, currently pos 13) even as an online-only retailer (mark as "online retailer")
- [ ] **Audit product page descriptions** for manufacturer-copy duplication. Run a content uniqueness check across all SKUs and rewrite at least the top 100 product pages with unique, expert-voice descriptions.
- [ ] **Build topical authority cluster** around "how to rollerblade" (14,800 vol, pos 34) — create a comprehensive beginner's guide with sub-topics for stopping, turning, uphill skating, etc.

### Ongoing

- [ ] Publish at minimum 2 article posts/month with author attribution, FAQPage schema, and inverted-pyramid structure
- [ ] Monitor the 308 keywords currently at positions 21+ monthly — many have low KD (under 30) and should be achievable with content updates
- [ ] Track AI Overview displacement — set up a weekly check on whether the site is being cited in the AI Overviews for its top 20 commercial keywords
- [ ] Build backlink profile: target skate publications, YouTube skating channels, and skating community forums for editorial coverage of the customization service (unique differentiator)

---

## Key Metrics Benchmark (Feb 25, 2026)

| Metric                                        | Current        | Target (6 months)    |
| --------------------------------------------- | -------------- | -------------------- |
| "roller skates" position                      | 47             | Top 10               |
| "inline skates" position                      | 14             | Top 5                |
| "roller blades" position (transactional page) | 4 (wrong page) | Top 3 (product page) |
| Keywords pos 1–10                             | 593            | 700+                 |
| Keywords pos 21+                              | 308            | Under 200            |
| AI Overview citations                         | ~0             | 20+ keywords cited   |
| Total estimated traffic                       | ~3,820/mo      | 6,000+/mo            |

---

_Audit conducted using live site crawl of https://proskatersplace.com (Feb 25, 2026), Semrush keyword export (1,000 US keywords), and Google search result analysis._
