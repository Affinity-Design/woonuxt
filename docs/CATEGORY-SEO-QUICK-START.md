# Category SEO Quick Reference Guide

## 🚀 Quick Start

### Files You Need to Know

```
composables/
  └─ useCategorySEO.ts          # SEO composable (structured data, meta tags)

components/
  └─ CategoryContent.vue         # Content display (descriptions, FAQs, CTAs)

data/
  └─ category-content.ts         # Category-specific content data

pages/product-category/
  └─ [slug].vue                  # Main category page (updated with SEO)

docs/
  ├─ category-seo-implementation.md    # Full implementation guide (60+ pages)
  ├─ category-keyword-strategy.md      # Keyword targeting recommendations
  └─ CATEGORY-SEO-SUMMARY.md          # This implementation summary
```

---

## 📊 What Was Implemented

### ✅ SEO Features

- **Structured Data**: CollectionPage, ItemList, BreadcrumbList schemas
- **Canadian SEO**: Bilingual hreflang, CAD pricing, geo-targeting (Toronto/Canada)
- **Meta Tags**: Keyword-optimized titles + descriptions
- **Content**: Above/below fold descriptions with H2 headings
- **FAQs**: 5-7 per category with FAQ schema
- **Trust Signals**: 4 benefit icons (shipping, pricing, advice, warranty)
- **Internal Linking**: Subcategories, buying guides, related content
- **Canonicals**: Proper handling for filtered/paginated views

### ✅ Categories with Content

1. **Inline Skates** - 6 FAQs, 800+ words content
2. **Roller Skates** - 5 FAQs, 700+ words content
3. **Protective Gear** - 3 FAQs, 400+ words content
4. **Clearance Items** - 3 FAQs, 300+ words content

---

## 🎯 Expected Results

### 3 Months

- **Traffic**: +40-60% organic to categories
- **Rankings**: Top 10 for primary keywords
- **Snippets**: 2-3 featured snippets per category
- **CTR**: +20-30% improvement

### 6 Months

- **Traffic**: +80-120% organic
- **Rankings**: Top 5 for primary keywords
- **Revenue**: +$50-80k/year from organic
- **Conversion**: +15-25% category conversion rate

---

## 🛠️ Adding Content for New Categories

### Step 1: Add to `data/category-content.ts`

```typescript
'your-category-slug': {
  topDescription: `
    <h2>Keyword-Rich Title</h2>
    <p>Brief intro with primary keywords, geographic terms (Canada, Toronto),
    and trust signals (free shipping, CAD pricing).</p>
  `,

  bottomDescription: `
    <h2>Detailed Section Title</h2>
    <p>300-500 words with long-tail keywords, internal links,
    and trust-building content.</p>
  `,

  benefits: [
    { icon: 'mdi:truck-fast', title: 'Free Shipping', description: 'On $99+ CAD' },
    { icon: 'mdi:currency-usd', title: 'CAD Pricing', description: 'All prices in CAD' },
    { icon: 'mdi:account-question', title: 'Expert Advice', description: 'Free sizing help' },
    { icon: 'mdi:shield-check', title: 'Warranty', description: 'Full manufacturer warranty' },
  ],

  faqs: [
    {
      question: 'Question targeting long-tail keyword?',
      answer: '150-250 word answer with keywords, links, and actionable advice.'
    },
    // Add 5-7 FAQs total
  ],

  buyingGuide: {
    title: 'Need Help Choosing?',
    description: 'Read our comprehensive buying guide...',
    link: '/blog/guide-slug',
    linkText: 'Read Guide'
  },

  keywords: ['primary keyword', 'secondary keyword', 'long-tail keyword'],
  h2Headings: ['H2 Heading 1', 'H2 Heading 2']
}
```

### Step 2: Content Writing Checklist

**Top Description (Above Fold):**

- [ ] 150-200 words
- [ ] Primary keyword in first sentence
- [ ] Geographic terms (Canada, Toronto, Ontario)
- [ ] Trust signals (free shipping, CAD pricing)
- [ ] Product count/selection size
- [ ] H2 heading with keyword

**Bottom Description (Below Fold):**

- [ ] 300-500 words
- [ ] 2-3 H2/H3 subheadings
- [ ] Long-tail keywords naturally integrated
- [ ] Internal links to subcategories/blog posts
- [ ] Bullet lists for readability
- [ ] Trust-building content (why buy from us)

**FAQs:**

- [ ] 5-7 questions minimum
- [ ] Target "People also ask" queries
- [ ] Include keywords naturally
- [ ] 150-250 words per answer
- [ ] Actionable information

**Benefits:**

- [ ] 4 benefits with icons
- [ ] Free shipping (threshold)
- [ ] CAD pricing
- [ ] Expert advice
- [ ] Warranty/returns

---

## 🎨 Icon Options (For Benefits)

Common icons for skating e-commerce:

```typescript
'mdi:truck-fast'; // Free/fast shipping
'mdi:currency-usd'; // CAD pricing
'mdi:account-question'; // Expert advice
'mdi:shield-check'; // Warranty/safety
'mdi:star'; // Top brands/quality
'mdi:hand-heart'; // Customer service
'mdi:map-marker'; // Local/Toronto
'mdi:cash-multiple'; // Price match
'mdi:clock-fast'; // Fast processing
'mdi:package-variant'; // Easy returns
```

Browse more: https://icon-sets.iconify.design/mdi/

---

## 🔍 SEO Best Practices

### Title Format

```
Category Name | Shop 150+ Products | Canada | ProSkaters Place
```

### Meta Description Format

```
Shop 150+ [category] in Canada at ProSkaters Place. Free shipping on $99+ CAD.
[Brand mentions]. Expert advice, fast delivery from Toronto. [Unique selling points].
```

### H1 Format

```vue
<h1>{{ categoryTitle }}</h1>
<p>{{ productCount }} products available in Canada</p>
```

### Canonical URL Rules

- **Base category**: `/product-category/inline-skates` (no parameters)
- **Allowed filters**: `?brand=rollerblade&size=9` (specific, indexable)
- **Blocked filters**: `?color=black&price=100-200` (points to base)

---

## 📈 Keyword Research Template

For each category, identify:

### 1. Primary Keywords (High Volume)

- `[category] Canada` (e.g., "inline skates Canada")
- `buy [category]` (e.g., "buy roller skates")
- `[category] [city]` (e.g., "inline skates Toronto")
- `[brand] Canada` (e.g., "Rollerblade Canada")

### 2. Secondary Keywords (Medium Volume)

- `best [category] Canada`
- `[category] free shipping`
- `[subcategory] Canada` (e.g., "aggressive inline skates Canada")
- `[brand] [category]` (e.g., "K2 inline skates")

### 3. Long-Tail Keywords (Low Competition)

- `best [category] for beginners Canada`
- `where to buy [category] [city]`
- `[category] [specific feature]` (e.g., "adjustable kids skates")
- `[brand] [model] Canada`

### Tools to Use

- Google Keyword Planner (focus on Canada location)
- Ahrefs/SEMrush (competitor analysis)
- Google "People also ask" (FAQ ideas)
- Google Search Console (discover new keywords)

---

## 🧪 Testing Checklist

### Before Deployment

- [ ] Run `npm run build` successfully
- [ ] No TypeScript errors (auto-import warnings OK)
- [ ] Category content exists in `data/category-content.ts`
- [ ] Test Google Rich Results: https://search.google.com/test/rich-results
- [ ] Verify mobile responsive
- [ ] Check page load speed (< 3s)

### After Deployment

- [ ] Request indexing in Google Search Console
- [ ] Run `npm run warm-cache` to populate Cloudflare KV
- [ ] Check all category pages load correctly
- [ ] Verify structured data in search results (24-48 hours)
- [ ] Monitor Google Analytics for traffic
- [ ] Check rankings for target keywords (weekly)

### Validation Tools

- **Rich Results**: https://search.google.com/test/rich-results
- **Mobile-Friendly**: https://search.google.com/test/mobile-friendly
- **PageSpeed**: https://pagespeed.web.dev/
- **Schema Validator**: https://validator.schema.org/

---

## 🚨 Common Issues & Solutions

### Issue: "TypeError: Cannot read property 'topDescription' of null"

**Cause:** Category slug not in `category-content.ts`  
**Solution:** Add entry to `data/category-content.ts` or make content optional in component

### Issue: Structured data not validating

**Cause:** Missing required fields or JSON syntax error  
**Solution:** Test with Google Rich Results Test, check `useCategorySEO.ts` schemas

### Issue: Category page showing generic title

**Cause:** `setCategorySEO()` not running or running after initial render  
**Solution:** Check watcher in `[slug].vue` has `immediate: true`

### Issue: Content not showing on page

**Cause:** `CategoryContent` component not imported or props not passed  
**Solution:** Verify component import and `:top-description`, `:faqs`, etc. props

### Issue: Slow category page loading

**Cause:** Cache not warmed or prerendering not working  
**Solution:** Run `npm run warm-cache`, verify route rules in `nuxt.config.ts`

---

## 📱 Mobile Optimization

### Responsive Grid Breakpoints

```vue
<!-- Benefits: 2 cols mobile, 4 cols desktop -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
```

### Font Sizes

```css
/* H1 */
text-2xl md:text-3xl        /* 24px → 36px */

/* H2 */
text-xl md:text-2xl         /* 20px → 24px */

/* Body */
text-sm md:text-base        /* 14px → 16px */
```

### Performance

- Lazy load images below fold
- Defer non-critical CSS
- Preconnect to CDN domains
- Minimize main thread work

---

## 🎯 Priority Categories to Optimize

### Tier 1 (Highest Impact)

1. **Inline Skates** ✅ - 1,200/mo searches, highest traffic potential
2. **Roller Skates** ✅ - 980/mo searches, high conversion

### Tier 2 (High Impact)

3. **Protective Gear** ✅ - Essential upsell, 410/mo searches
4. **Clearance Items** ✅ - High conversion, seasonal

### Tier 3 (Medium Impact)

5. **Wheels & Bearings** 🔲 - Enthusiast market, 320/mo searches
6. **Kids Skates** 🔲 - Growing segment, 280/mo searches
7. **Accessories** 🔲 - Cross-sell opportunity, 240/mo searches

### Tier 4 (Subcategories)

8. **Recreational Inline Skates** 🔲
9. **Aggressive Inline Skates** 🔲
10. **Outdoor Roller Skates** 🔲

---

## 📊 KPI Dashboard (Track These)

### Traffic Metrics

- Category page sessions (GA4)
- Organic sessions by category
- Geographic traffic (Canada vs US vs other)

### Ranking Metrics

- Primary keyword positions (Ahrefs/SEMrush)
- Featured snippet captures
- Average position for category keywords

### Engagement Metrics

- Bounce rate (target: < 50%)
- Pages per session (target: > 3)
- Time on page (target: > 2 minutes)

### Conversion Metrics

- Category → product clicks
- Add to cart rate
- Purchase completion rate
- Average order value

### Technical Metrics

- Core Web Vitals (LCP, FID, CLS)
- Mobile usability (0 issues)
- Structured data validation (0 errors)

---

## 📅 Maintenance Schedule

### Weekly (15 min)

- Check Google Search Console for errors
- Monitor keyword rankings (top 5-10)
- Add 1-2 new FAQs based on customer questions

### Monthly (1-2 hours)

- Update product counts if changed significantly
- Add seasonal content updates
- Review Google Analytics traffic trends
- A/B test title/description variations

### Quarterly (3-4 hours)

- Comprehensive keyword research
- Full content refresh (update descriptions)
- Analyze competitor category pages
- Expand internal linking strategy
- Update buying guides

---

## 🔗 Key Documentation Links

**Implementation Guides:**

- `docs/category-seo-implementation.md` - Full guide (60+ pages)
- `docs/category-keyword-strategy.md` - Keyword targeting
- `docs/CATEGORY-SEO-SUMMARY.md` - Implementation summary

**Related Docs:**

- `docs/seo-implementation.md` - Overall SEO strategy
- `docs/product-seo-enhancement.md` - Product page SEO
- `docs/how-caching-works.md` - Performance/caching

**Code Files:**

- `composables/useCategorySEO.ts` - SEO composable
- `composables/useCanadianSEO.ts` - Base Canadian SEO
- `components/CategoryContent.vue` - Content component
- `data/category-content.ts` - Category content data

---

## 💬 Quick Commands

```bash
# Build with SEO optimizations
npm run build

# Warm Cloudflare KV cache
npm run warm-cache

# Test dev server
npm run dev

# Preview production build
npm run preview

# Run tests (if applicable)
npm run test
```

---

## ✅ Success Checklist

Use this checklist to verify your category SEO is working:

**Content:**

- [ ] Unique title with product count
- [ ] Compelling meta description with Canadian terms
- [ ] Top description above fold (150-200 words)
- [ ] Bottom description below fold (300-500 words)
- [ ] 5-7 FAQs with detailed answers
- [ ] 4 trust signal/benefit icons
- [ ] Buying guide CTA (if applicable)

**Technical:**

- [ ] CollectionPage schema validates
- [ ] ItemList schema validates
- [ ] BreadcrumbList schema validates
- [ ] Canonical URL set correctly
- [ ] Hreflang tags (en-CA, fr-CA)
- [ ] Mobile responsive
- [ ] Fast loading (< 3s LCP)

**SEO:**

- [ ] Primary keyword in title (position 1)
- [ ] Primary keyword in H1
- [ ] Secondary keywords in H2s
- [ ] Internal links to subcategories
- [ ] Internal links to blog posts
- [ ] Image alt text optimized
- [ ] No duplicate content

**Performance:**

- [ ] Images lazy loaded
- [ ] Cloudflare KV cache warmed
- [ ] Prerendering working
- [ ] No JavaScript errors in console
- [ ] Core Web Vitals all green

---

**Last Updated:** November 13, 2025  
**Status:** ✅ Ready for Production

**Questions?** Refer to full documentation in `docs/` folder or review code in `composables/useCategorySEO.ts`
