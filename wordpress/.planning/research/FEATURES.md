# Feature Research

**Domain:** Operational SEO program for a live WordPress commerce site
**Researched:** 2026-04-07
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature                                                   | Why Expected                                                                        | Complexity | Notes                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Explicit owner, KPI, and QA tracking per workstream       | An SEO program without accountability turns into stale docs and unverifiable claims | LOW        | Already partially modeled in `seo-execution-board.md`; needs to become the default workflow |
| Live-page verification after implementation               | Code execution alone does not prove SEO outcomes                                    | LOW        | Must include schema, content placement, and routing checks on representative URLs           |
| Commercial page upgrades for the highest-value categories | Head terms need strong destination pages, not just content volume                   | MEDIUM     | Roller skates and inline skates are the immediate commercial priorities                     |
| Intent-aware internal linking and redirect mapping        | Valuable queries currently resolve to the wrong assets                              | MEDIUM     | Mapping must be reviewed before redirect deployment                                         |
| Content QA standards for AI-assisted changes              | The current risk is quality drift, not lack of content                              | MEDIUM     | Sample-based review and rollback need to be formalized                                      |

### Differentiators (Competitive Advantage)

| Feature                                                  | Value Proposition                                                            | Complexity | Notes                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| Brand-page automation modeled on a live proven pipeline  | Leverages a system already validated on production brand pages               | MEDIUM     | Best existing implementation benchmark in the repo        |
| Answer-first formatting for AI Overview-style extraction | Improves extractability without giving up commercial intent                  | MEDIUM     | Especially valuable on top traffic informational articles |
| Research-backed governance loop with artifact tracking   | Makes the SEO program durable instead of doc-heavy and memory-light          | LOW        | This is a strategic advantage over ad hoc execution       |
| Explicit rollback-safe automation rollout model          | Enables scaling content work without betting the site on a single script run | MEDIUM     | Critical before product-description rewrites              |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature                                       | Why Requested               | Why Problematic                                                                | Alternative                                                  |
| --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Bulk AI rewriting across products or articles | Fast visible output         | Scales templated copy, factual drift, and QA debt faster than rankings improve | Small reviewed batches with a rubric and rollback path       |
| Redirect execution before mapping             | Feels like a quick SEO fix  | Can route valuable terms to weak destinations and create new crawl issues      | Review query-to-URL maps first, then implement               |
| Mixed-market template reuse                   | Easy to reuse existing copy | Causes US pages to leak Canada or Toronto language and weakens trust           | Rewrite priority templates to a clear US-commercial standard |

## Feature Dependencies

```
[Commercial category upgrades]
    └──requires──> [Governance baseline]
                         └──requires──> [Current-truth source docs]

[Redirect implementation]
    └──requires──> [Redirect map]
                         └──requires──> [Commercial intent review]

[Product rewrite rollout]
    └──requires──> [QA rubric and sample review]

[Article answer-first retrofit] ──enhances──> [Commercial intent routing]

[Bulk AI rollout] ──conflicts──> [Strict QA and rollback discipline]
```

### Dependency Notes

- **Commercial category upgrades require governance baseline:** the project needs clear acceptance and measurement rules before shipping high-visibility commercial edits.
- **Redirect implementation requires a redirect map:** plugin setup is operationally separate from strategic URL decisions.
- **Product rewrite rollout requires QA rubric and sample review:** this is the highest-risk automation in scope.
- **Article answer-first retrofit enhances commercial routing:** better articles can support, rather than cannibalize, the intended destination pages.
- **Bulk AI rollout conflicts with strict QA discipline:** speed pressure is the main force that can break the program.

## MVP Definition

### Launch With (v1)

- [ ] Governance baseline and source-of-truth cleanup — essential because the current problem is partially operational, not just tactical.
- [ ] Template hygiene fixes — essential because the live site still contradicts completed-work claims.
- [ ] Brand rollout closure — essential because the strongest automation needs measurement closure.
- [ ] Commercial category upgrades and roller-skates hub page — essential because this is the clearest commercial upside.
- [ ] Redirect mapping and safe implementation path — essential because intent mismatches are known and costly.

### Add After Validation (v1.x)

- [ ] Answer-first article retrofit — add once governance and commercial routing are working.
- [ ] Author and trust standardization — add once article templates are being actively revised.

### Future Consideration (v2+)

- [ ] Scaled product-description rewrites — defer until QA controls prove they can stop mediocre output from scaling.
- [ ] Broader category-program rollout — defer until the first two category upgrades show measurable lift.

## Feature Prioritization Matrix

| Feature                             | User Value | Implementation Cost | Priority |
| ----------------------------------- | ---------- | ------------------- | -------- |
| Governance baseline                 | HIGH       | LOW                 | P1       |
| Template hygiene fixes              | HIGH       | MEDIUM              | P1       |
| Brand rollout closure               | MEDIUM     | MEDIUM              | P1       |
| Category upgrades plus hub page     | HIGH       | HIGH                | P1       |
| Redirect mapping and implementation | HIGH       | MEDIUM              | P1       |
| Article answer-first retrofit       | MEDIUM     | MEDIUM              | P2       |
| Author/E-E-A-T standardization      | MEDIUM     | MEDIUM              | P2       |
| Product rewrite scale-up            | HIGH       | HIGH                | P3       |

**Priority key:**

- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature                          | Competitor A                                                        | Competitor B                                                      | Our Approach                                                                                         |
| -------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Commercial category intent pages | Large skate retailers often use tightly merchandised category copy  | Editorial-heavy sites often let articles absorb commercial demand | Build stronger transactional category pages and a dedicated hub where categories alone are too broad |
| Author trust signals             | Many commerce blogs use named authors or editorial teams            | Thin affiliate sites often skip trust framing entirely            | Standardize a practical byline and trust layer that improves on current partial `PSP Team` presence  |
| Structured answer formatting     | Publishers increasingly use direct-answer blocks for extractability | Older content programs rely on generic long-form intros           | Retrofit priority articles to answer-first patterns without turning them into snippet bait only      |

## Sources

- `wordpress/docs/master-seo-plan-current.md`
- `wordpress/docs/seo-execution-board.md`
- `wordpress/docs/live-seo-reality-check-2026-04-07.md`

---

_Feature research for: Operational SEO program for a live WordPress commerce site_
_Researched: 2026-04-07_
