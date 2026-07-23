# Blog Rehydration — Next-Best Topics (July 2026)

**Generated:** 2026-07-23 from live DataForSEO data (Canada, location 2124)
**Method:** 756 current .ca ranked keywords (Labs ranked_keywords) + keyword_suggestions across 6 informational seeds, cross-referenced against all 20 published posts in `content/blog/` and `data/blog-keywords-used.md`. Raw data: scratchpad `blog-rehydration-raw.json`; API cost $0.18.
**Why:** the old `seo_Keywordlist.csv` pipeline is fully exhausted (every high-priority keyword published). This doc IS the new pipeline. Volumes below are fresh Canadian monthly searches, not the stale 2025 snapshot.

---

## What the data says (read this before picking topics)

1. **The Toronto local playbook worked.** `/blog/roller-skating-toronto-guide` holds positions 1–7 on the entire Toronto rink cluster (~4,000+ sv combined) — and is *accidentally* ranking nationally at positions 19–39 for "roller skating near me" (4,400 sv), "roller rinks near me" (1,000 sv), "indoor roller skating" (880 sv), "roller skating indoor" (880 sv), "roller skating places" (590 sv). One Toronto page cannot win national near-me queries — a dedicated national page can.
2. **"roller skating" itself (18,100 sv, kd 23) ranks pos 30** via the Toronto guide. The generic activity term has no dedicated page.
3. **Two existing posts are underperforming their targets** and should be refreshed before new adjacent content is written (see Refresh queue).
4. Local-city replication is proven and cheap: "inline skating vancouver" (260 sv, kd 0) has zero coverage.

---

## Priority queue — write in this order

### 1. Roller Rinks & Indoor Roller Skating Across Canada (2026) ⭐ WRITE FIRST

- **Primary:** roller skating near me (4,400 sv, kd 23, currently pos 39 via wrong page)
- **Cluster:** roller rinks near me (1,000, kd 5, pos 19) · indoor roller skating (880, kd 6, pos 22) · roller skating indoor (880, kd 7, pos 36) · roller skating places (590, kd 6, pos 37) · rollerskating (880, kd 24, pos 32) — **~8,600 sv combined, all striking distance**
- **Slug:** `/blog/roller-rinks-indoor-skating-canada`
- **Angle:** national "where to skate" directory — rinks/indoor spots by province+city (Toronto, Vancouver, Montreal, Calgary, Ottawa, Edmonton…), what to expect, admission prices, rental vs bring-your-own.
- **Cannibalization guard:** Toronto section stays short and links to `/blog/toronto-roller-skating-spots-2026` and `/blog/roller-skating-toronto-guide` — this page targets *national* near-me intent, the Toronto pages keep the city intent.
- **Internal links:** `/product-category/roller-skates`, `/product-category/inline-skates`, `/roller-skates-size-calculator`, `/blog/complete-beginners-guide-inline-quad-skating`.

### 2. How to Roller Skate: Step-by-Step for Adults

- **Primary:** how to roller skate (320 sv, kd 3)
- **Cluster:** how to skate roller (320, kd 7) · how to skate on roller skates (320, kd 13) — ~960 sv, all informational, no dedicated page
- **Slug:** `/blog/how-to-roller-skate`
- **Angle:** pure technique tutorial (stance, first strides, stopping, falling safely, 30-day progression). Distinct from the beginners *buying/starting* guide — link to it, don't overlap gear advice.
- **Internal links:** `/blog/complete-beginners-guide-inline-quad-skating`, `/blog/how-to-skate-backwards-tutorial`, `/roller-skates-size-calculator`.

### 3. Is Roller Skating Good Exercise? Calories, Benefits & Workouts

- **Primary:** skating exercise (390 sv, kd 0)
- **Cluster:** is skating good exercise (170, kd 3) · speed skating exercise (170) · roller skating benefits/calories long-tail — ~750+ sv, zero competition
- **Slug:** `/blog/roller-skating-exercise-benefits`
- **Angle:** fitness TOFU — calories/hour tables vs running/cycling, muscle groups, beginner workout plans, physio-friendly framing.
- **Internal links:** both beginner guides, `/product-category/inline-skates`, protection gear category.

### 4. Inline Skating & Rollerblading in Vancouver: Best Spots (2026)

- **Primary:** inline skating vancouver (260 sv, kd 0)
- **Cluster:** vancouver seawall skating long-tail, rollerblading vancouver
- **Slug:** `/blog/inline-skating-vancouver-guide`
- **Angle:** replicate the proven Toronto playbook (pos 1–7 sweep) city-by-city. Vancouver first (Seawall = iconic), then Montreal (Lachine Canal) and Calgary as later entries in this series.
- **Internal links:** national rinks post (#1), `/product-category/inline-skates`, beginner guide.

### 5. Aggressive Inline Skating: Complete Intro & Gear Guide

- **Primary:** aggressive inline skating (260 sv, kd 0)
- **Cluster:** aggressive inline skating equipment (260, kd 0) — ~520 sv, transactional-adjacent
- **Slug:** `/blog/aggressive-inline-skating-guide`
- **Angle:** discipline explainer (park/street/UFR), gear differences (frames, grind blocks, boots), starter skate picks. Direct feeder to the aggressive-skates category.
- **Note:** the .com audit found "aggressive inline skates" is a US SERP PSP is invisible on — this post's structure can be reused for a .com version later.

### 6. Inline Speed Skating: Skates, Technique & Getting Started

- **Primary:** inline speed skating (260 sv, kd 2)
- **Cluster:** speed skating inline skates (260) · inline skating speed (260) · skates for speed skating (880, kd 0 — already pos 27 via pro-skates post) — ~1,600 sv combined
- **Slug:** `/blog/inline-speed-skating-guide`
- **Cannibalization guard:** `/blog/pro-skates-professional-guide` currently catches "skates for speed skating" at pos 27 — link from it to this new dedicated page and keep pro-skates focused on "what pros use".

### 7. Inline Skating Hockey (Roller Hockey) Starter Guide

- **Primary:** inline skating hockey (480 sv, kd 0)
- **Slug:** `/blog/roller-hockey-starter-guide`
- **Angle:** roller hockey vs ice hockey gear, skate differences, where to play in Canada. Feeder to hockey-adjacent products (the store already ranks for hockey accessories).

### 8. What Is Inline Skating? (+ glossary)

- **Primary:** what is inline skating (170 sv, kd 2)
- **Slug:** fold into the `inline-skating-guide` refresh (below) as an FAQ/definition section first; only break out as its own post if the refresh doesn't capture it within ~8 weeks.

---

## Refresh queue (do alongside new posts — these are leaks, not gaps)

| Post | Problem (fresh data) | Fix |
| --- | --- | --- |
| `/blog/inline-skating-guide` | **"inline skating" is 4,400 sv kd 11 in Canada and the post doesn't rank top-100** (site doesn't appear for it at all; the term's volume 5×'d vs the 880 in the old sheet) | Rewrite title/H1 to target "inline skating" head-on, expand to true pillar (what/how/gear/where), add FAQ + "what is inline skating" (170 sv) section, internal links from all inline posts |
| `/blog/inline-skates-vs-roller-skates` | vs-cluster is ~1,440 sv (inline skating vs roller skating 480 · roller skating vs inline skating 480 · rollerblades vs roller skates 480) but the post sits at **pos 51–54** | Refresh with comparison table targeting all three phrasings in H2s, add schema-friendly verdict summary, link from both beginner guides |
| `/blog/roller-skating-toronto-guide` | Ranking nationally for near-me terms it can't win (pos 19–39) | Once post #1 is live, tighten this page back to Toronto intent and interlink both ways |

---

## Rules for every new post (unchanged)

1,000–2,500 words, H2/H3 structure, one primary keyword per post, secondaries in H2s. Internal links from the post body to at least one product category + one sibling post. Generate hero image via `node scripts/generate-blog-image.js "<keyword>" --posted`. Log the keyword in `data/blog-keywords-used.md` on publish (it has drifted before — log at publish time, not after). Check `content/blog/` for overlap before writing.

**Next research re-run:** when this queue is ~70% published, re-run the ranked-keywords pull (script preserved at scratchpad `blog-rehydration-research.js` — move it to `scripts/` if it should live in-repo) and mine `data/brand-keywords-full.json` for brand-topic posts.
