#!/usr/bin/env node
/**
 * lib/category-prompts.js
 *
 * Prompt template functions for WooCommerce product category page content generation.
 * Companion to: wordpress/scripts/optimize-category-page.js
 *
 * All prompts follow ProSkaters Place brand voice:
 *   - Authoritative but approachable
 *   - American English spelling (color, center, favorite, gray, etc.)
 *   - US market targeting (primary), worldwide (secondary)
 *   - Focus on expert advice, product knowledge, buying guidance
 *
 * NOTE: These scripts target proskatersplace.com (US .com site).
 *       The Nuxt/Vue frontend at proskatersplace.ca is a separate Canadian project.
 *
 * Categories differ from brands:
 *   - No authorized dealer badge / brand website links
 *   - Content focuses on WHAT the products ARE, use cases, buying guides
 *   - Can suggest renaming the category name (never the slug)
 *   - Research is about product type, not brand identity
 *   - Internal links go to subcategories, parent categories, related categories
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_NAME = 'ProSkaters Place';
const SITE_LOCATION = 'North America';
const SITE_URL = 'proskatersplace.com';
const USP_POINTS = [
  'expert staff with decades of skating & winter sports experience',
  'free shipping available on qualifying US orders',
  'genuine manufacturer warranty on all products',
  'personalized fitting advice available in-store and online',
  'largest selection of inline skates and roller sports gear in the US',
];

function approximateProductCountLabel(count) {
  const numericCount = Number(count) || 0;

  if (numericCount >= 1000) return `${Math.floor(numericCount / 100) * 100}+`;
  if (numericCount >= 500) return `${Math.floor(numericCount / 50) * 50}+`;
  if (numericCount >= 100) return `${Math.floor(numericCount / 25) * 25}+`;
  if (numericCount >= 25) return `${Math.floor(numericCount / 10) * 10}+`;
  if (numericCount > 0) return `${numericCount}+`;

  return 'a wide selection of';
}

// ─── Category relationship map ────────────────────────────────────────────────
// Maps subcategories to their logical parents and related categories.
// Used for internal linking and context in prompts.

const CATEGORY_RELATIONS = {
  'inline-skates': {
    parent: 'inline-skating',
    related: ['inline-skate-wheels', 'inline-frames', 'inline-skate-bearings', 'inline-skate-liners', 'protection-gear-and-apparel'],
  },
  'inline-skate-wheels': {parent: 'inline-skating', related: ['inline-skates', 'inline-skate-bearings', 'inline-frames']},
  'inline-frames': {parent: 'inline-skating', related: ['inline-skates', 'inline-skate-wheels', 'inline-skate-bearings']},
  'inline-skate-bearings': {parent: 'inline-skating', related: ['inline-skates', 'inline-skate-wheels', 'inline-frames']},
  'inline-skate-liners': {parent: 'inline-skating', related: ['inline-skates', 'inline-boots']},
  'inline-boots': {parent: 'inline-skating', related: ['inline-skates', 'inline-skate-liners', 'inline-frames']},
  'roller-skates': {parent: 'roller-skating', related: ['roller-skate-wheels', 'roller-skate-bearings', 'roller-skate-parts', 'protection-gear-and-apparel']},
  'roller-skate-wheels': {parent: 'roller-skating', related: ['roller-skates', 'roller-skate-bearings', 'roller-skate-parts']},
  'roller-skate-bearings': {parent: 'roller-skating', related: ['roller-skates', 'roller-skate-wheels']},
  'roller-skate-parts': {parent: 'roller-skating', related: ['roller-skates', 'roller-skate-wheels', 'roller-skate-bearings']},
  'protective-helmets': {parent: 'protection-gear-and-apparel', related: ['knee-and-elbow-pads', 'gloves-wrist-protection', 'protective-shorts']},
  'knee-and-elbow-pads': {parent: 'protection-gear-and-apparel', related: ['protective-helmets', 'gloves-wrist-protection', 'protection-packs']},
  'gloves-wrist-protection': {parent: 'protection-gear-and-apparel', related: ['protective-helmets', 'knee-and-elbow-pads', 'protection-packs']},
  'cross-country-skis': {parent: 'winter-sports', related: ['nordic-ski-boots', 'cross-country-poles', 'nordic-accessories', 'ski-wax']},
  'nordic-ski-boots': {parent: 'winter-sports', related: ['cross-country-skis', 'cross-country-poles', 'nordic-accessories']},
  'cross-country-poles': {parent: 'winter-sports', related: ['cross-country-skis', 'nordic-ski-boots', 'nordic-accessories']},
  'alpine-skis': {parent: 'winter-sports', related: ['alpine-ski-boots', 'alpine-poles', 'alpine-accessories']},
  'alpine-ski-boots': {parent: 'winter-sports', related: ['alpine-skis', 'alpine-poles', 'alpine-accessories']},
  scooters: {parent: null, related: ['trick-scooters', 'scooter-parts']},
  'trick-scooters': {parent: 'scooters', related: ['scooter-parts']},
  'skateboards-and-longboards': {parent: null, related: ['longboards', 'shortboard-skateboards', 'board-components-parts', 'board-wheels']},
  skiboards: {parent: 'winter-sports', related: ['alpine-skis', 'alpine-ski-boots']},
};

// ─── extractCategoryContext ───────────────────────────────────────────────────

/**
 * Parses the existing WordPress category description to extract real facts.
 * Unlike brands, categories typically have product-focused descriptions.
 *
 * @param {string} html - The existing category description HTML
 * @param {string} categorySlug - Category slug
 * @returns {object} - { rawText, hasExistingContent, productTypes, priceRange, keyFeatures }
 */
function extractCategoryContext(html, categorySlug) {
  const context = {
    rawText: '',
    hasExistingContent: false,
    productTypes: [],
    priceRange: null,
    keyFeatures: [],
    subcategories: [],
  };

  if (!html || html.trim().length < 20) {
    return context;
  }

  context.hasExistingContent = true;

  // Strip HTML tags for raw text
  context.rawText = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract price mentions (e.g., "$49.99", "starting at $99")
  const priceMatches = context.rawText.match(/\$[\d,.]+/g);
  if (priceMatches && priceMatches.length >= 2) {
    const prices = priceMatches.map((p) => parseFloat(p.replace(/[,$]/g, ''))).filter((p) => !isNaN(p));
    if (prices.length >= 2) {
      context.priceRange = {min: Math.min(...prices), max: Math.max(...prices)};
    }
  }

  // Extract listed features (bullet points or bolded items)
  const featurePatterns = [/<strong>([^<]+)<\/strong>/gi, /<li>([^<]+)<\/li>/gi];
  for (const pattern of featurePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const feat = match[1].trim();
      if (feat.length > 5 && feat.length < 80) {
        context.keyFeatures.push(feat);
      }
    }
  }

  return context;
}

// ─── categoryDescriptionPrompt ────────────────────────────────────────────────

/**
 * Generates the short category description prompt (targets 80-120 words).
 * This content goes in the WP `description` field and renders ABOVE products.
 *
 * @param {object} category - Category data { name, slug, count, parent }
 * @param {object} keywords - { primary, secondary, longtail, intent }
 * @param {object} categoryContext - From extractCategoryContext()
 * @param {object} [options] - { subcategories, parentName }
 * @returns {string} - Prompt string
 */
function categoryDescriptionPrompt(category, keywords, categoryContext, options = {}) {
  const {primary, secondary = [], longtail = [], intent = 'commercial'} = keywords;
  const secondaryList = secondary.slice(0, 8).join(', ');
  const subcategories = options.subcategories || [];
  const parentName = options.parentName || null;
  const approxCount = approximateProductCountLabel(category.count);

  // Build context block for Gemini grounding
  const contextLines = [];
  if (category.count) {
    contextLines.push(`- Selection depth: about ${approxCount} products available`);
  }
  if (parentName) {
    contextLines.push(`- Parent category: ${parentName}`);
  }
  if (subcategories.length > 0) {
    contextLines.push(`- Subcategories: ${subcategories.map((s) => s.name).join(', ')}`);
  }
  if (categoryContext.priceRange) {
    contextLines.push(`- Price range: $${categoryContext.priceRange.min} - $${categoryContext.priceRange.max} USD`);
  }
  if (categoryContext.rawText && categoryContext.rawText.length > 30) {
    const truncated = categoryContext.rawText.length > 400 ? categoryContext.rawText.slice(0, 400) + '...' : categoryContext.rawText;
    contextLines.push(`- Existing description (factual source): "${truncated}"`);
  }

  const contextBlock = contextLines.length > 0 ? `\nCATEGORY CONTEXT:\n${contextLines.join('\n')}\n` : '';

  return `You are writing a short introductory description for the "${category.name}" product category page on ${SITE_NAME} (${SITE_URL}), a US-based inline skate, roller sports, and winter sports retailer.

TASK: Write a concise 80-120 word HTML description. This appears ABOVE the product grid — it must be compelling and keyword-rich to hook both users and search engines.
${contextBlock}
KEYWORD TARGETING:
- Primary keyword: "${primary}"
- Secondary keywords: ${secondaryList || '(none specified)'}
- Search intent: ${intent}
- Use the primary keyword "${primary}" naturally in the FIRST sentence — Rank Math scores this field for focus keyword presence.

CONTENT REQUIREMENTS:
- Open with what ${category.name} ARE and who they're for
- Mention ${SITE_NAME} and our ${approxCount === 'a wide selection of' ? 'wide selection of' : approxCount} products without using an exact inventory number
- If shipping is mentioned, keep it generic: "free shipping available on qualifying US orders" or "shipping available across the US"
- End with a subtle CTA (browse below, shop now, etc.)

TONE & STYLE:
- Authoritative but approachable
- American English: color, center, favorite, gray, aluminum
- Do NOT use: "Introduction", "In Conclusion", "Look no further", "one-stop shop"
- Paragraphs max 60 words each
- No markdown — output clean HTML only (<p> tags)

OUTPUT: HTML only — no intro, no explanation. Start with the first <p>.`;
}

// ─── categoryBelowContentPrompt ───────────────────────────────────────────────

/**
 * Generates the full below-products content prompt (targets 400-600 words).
 * This goes in Shoptimizer's "Below Category Content" field (second_desc).
 *
 * @param {object} category - Category data
 * @param {object} keywords - Keyword targeting data
 * @param {object} categoryContext - From extractCategoryContext()
 * @param {object} [options]
 * @returns {string} - Prompt string
 */
function categoryBelowContentPrompt(category, keywords, categoryContext, options = {}) {
  const {primary, secondary = [], longtail = [], intent = 'commercial'} = keywords;
  const secondaryList = secondary.slice(0, 10).join(', ');
  const longtailList = longtail.slice(0, 5).join(', ');
  const subcategories = options.subcategories || [];
  const parentName = options.parentName || null;
  const topBrands = options.topBrands || [];
  const approxCount = approximateProductCountLabel(category.count);

  // Build category context for Gemini
  const contextLines = [];
  if (category.count) {
    contextLines.push(`- Selection depth: about ${approxCount} products available`);
  }
  if (parentName) {
    contextLines.push(`- Part of the "${parentName}" department`);
  }
  if (subcategories.length > 0) {
    contextLines.push(`- Subcategories: ${subcategories.map((s) => s.name).join(', ')}`);
  }
  if (topBrands.length > 0) {
    contextLines.push(`- Top brands in this category: ${topBrands.join(', ')}`);
  }
  if (categoryContext.rawText && categoryContext.rawText.length > 30) {
    const truncated = categoryContext.rawText.length > 500 ? categoryContext.rawText.slice(0, 500) + '...' : categoryContext.rawText;
    contextLines.push(`- Existing content (factual source): "${truncated}"`);
  }

  const contextBlock = contextLines.length > 0 ? `\nCATEGORY CONTEXT — use these REAL facts:\n${contextLines.join('\n')}\n` : '';

  // Build subcategory linking guidance
  const subcatGuidance =
    subcategories.length > 0
      ? `In the "Types of ${category.name}" section, mention and describe each subcategory: ${subcategories.map((s) => s.name).join(', ')}. These will be linked automatically — just mention them by name.`
      : `Describe the different types/styles of ${category.name} a buyer would consider (e.g., by skill level, use case, price point).`;

  return `You are writing detailed SEO content for the "${category.name}" product category page on ${SITE_NAME} (${SITE_URL}), a US-based inline skate, roller sports, and winter sports retailer.

TASK: Write a 400-600 word HTML content block. This appears BELOW the product grid and provides buying guidance, product education, and SEO value.
${contextBlock}
KEYWORD TARGETING:
- Primary keyword: "${primary}"
- Secondary keywords: ${secondaryList || '(none specified)'}
- Long-tail targets: ${longtailList || '(none specified)'}
- Search intent: ${intent}
- Use the primary keyword naturally 3-5 times. Use secondary keywords where they fit naturally.

⚠️  CRITICAL — FACTUAL ACCURACY:
- Only state facts about products that are true for this category
- If you're unsure about specific specs, features, or price points — stay general
- Do NOT invent product names, model numbers, or specific claims
- Focus on general product education and buying guidance

CONTENT REQUIREMENTS — use these H2 sections (and ONLY these):

1. <h2>How to Choose the Right ${category.name}</h2> (2-3 paragraphs): Buying guide covering key factors: skill level, intended use, key features to look for, sizing considerations. Be genuinely helpful — this is what ranks.

2. <h2>Types of ${category.name}</h2> (2-3 paragraphs): ${subcatGuidance}

3. <h2>Why Shop ${category.name} at ${SITE_NAME}?</h2> (1 paragraph): Expert advice, free shipping available on qualifying US orders, manufacturer warranties, personalized recommendations. CTA to contact info@proskatersplace.com.

TONE & STYLE:
- Authoritative but approachable — like advice from an expert shop owner
- American English: color, center, favorite, gray, aluminum
- Primary audience: US customers. Secondary: worldwide
- Do NOT start with the category name as the first word
- Never mention an exact product count; use broad phrasing like "a wide selection" or rounded counts such as "150+"
- Never mention a fixed free-shipping dollar threshold in generated copy
- Do NOT use: "Introduction", "In Conclusion", "Look no further", "comprehensive guide"
- Do NOT use generic filler: "Whether you're a beginner or expert"
- Paragraphs max 100 words each
- No markdown — output clean HTML only

HTML FORMAT:
- Use the three <h2> headings specified above
- Use <p> tags for paragraphs
- Use <strong> for 1-2 key points per section
- Use <ul>/<li> for feature lists where appropriate
- Do NOT include <h1> — the category name H1 is in the page template

OUTPUT: HTML only — no intro, no explanation. Start with the first <h2>.`;
}

// ─── categoryFAQPrompt ────────────────────────────────────────────────────────

/**
 * Generates FAQ section prompt (4-6 Q&A pairs).
 * Questions driven by DataForSEO keyword data for the category.
 *
 * @param {object} category - Category data
 * @param {string[]} faqQuestions - Question strings from DataForSEO
 * @param {object} [categoryContext] - From extractCategoryContext()
 * @returns {string} - Prompt string
 */
function categoryFAQPrompt(category, faqQuestions = [], categoryContext = {}) {
  const questionList =
    faqQuestions.length > 0
      ? faqQuestions
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')
      : `1. What are the best ${category.name.toLowerCase()} for beginners?
2. How much do ${category.name.toLowerCase()} cost?
3. How do I choose the right size ${category.name.toLowerCase()}?
4. What brands of ${category.name.toLowerCase()} does ProSkaters Place carry?
5. Does ProSkaters Place ship ${category.name.toLowerCase()} across the US?
6. What's the difference between budget and premium ${category.name.toLowerCase()}?`;

  const categoryFacts = categoryContext?.rawText ? `\nCATEGORY FACTS TO REFERENCE: "${categoryContext.rawText.slice(0, 300)}"` : '';

  return `You are writing a FAQ section for the "${category.name}" product category page on ${SITE_NAME} (${SITE_URL}), a US-based inline skate, roller sports, and winter sports retailer shipping worldwide.

TASK: Write a FAQ section with 4 to 6 question-and-answer pairs specifically about ${category.name}.
${categoryFacts}

REQUIRED: At least one Q&A MUST target "where to buy" / "best place to buy" intent — high-converting purchase intent.

REQUIRED: Every question MUST mention "${category.name}" or a close variant — no generic questions like "What gear do I need?" Use category-specific phrasing.

BASE QUESTIONS ON (answer the most relevant ones):
${questionList}

GUIDELINES:
- Each answer: 40-80 words, direct and helpful
- Mention ${SITE_NAME} or "we" naturally in 2-3 answers
- US-focused (USD pricing, shipping available across the US)
- American English spelling
- Answers should be genuinely useful — not marketing fluff
- Do not repeat information from the category description

OUTPUT FORMAT — return ONLY a valid JSON array, no other text:
[
  {"question": "Question about ${category.name}?", "answer": "Answer text here."},
  {"question": "Question about ${category.name}?", "answer": "Answer text here."}
]`;
}

// ─── categoryMetaPrompt ───────────────────────────────────────────────────────

/**
 * Generates meta title + description for a category page.
 *
 * @param {object} category - Category data
 * @param {string} primaryKeyword - The main keyword
 * @param {object} [options]
 * @returns {string} - Prompt string
 */
function categoryMetaPrompt(category, primaryKeyword, options = {}) {
  const approxCount = approximateProductCountLabel(options.productCount || category.count || 0);

  return `You are an SEO specialist writing Rank Math meta tags for the "${category.name}" product category page on ${SITE_NAME} (${SITE_URL}), a US inline skate, roller sports, and winter sports retailer.

TASK: Write an SEO title and meta description for Rank Math.

TARGET KEYWORD: "${primaryKeyword}"
CATEGORY: ${category.name}
SITE: ${SITE_NAME}
CONTEXT: about ${approxCount} products available, expert advice available, free shipping available on qualifying US orders

TITLE REQUIREMENTS (Rank Math scoring):
- MUST be 50–60 characters including spaces — hard range
- "${primaryKeyword}" MUST appear toward the START (first half)
- Include a differentiator: "${SITE_NAME}", "Shop", "Buy", year, etc.
- Suggested format: "${primaryKeyword} | ${SITE_NAME}" or "Shop ${primaryKeyword} - Expert Advice"
- No pipes or dashes at the very end
- Count characters carefully — must land in 50–60

META DESCRIPTION REQUIREMENTS (Rank Math scoring):
- MUST be 150–160 characters including spaces — hard range
- Include "${primaryKeyword}" naturally (Google bolds it in SERPs)
- End with a CTA: "Shop now.", "Expert fitting available.", or "Browse the collection."
- Mention selection depth if useful, but never use an exact product count
- Count characters carefully — must land in 150–160

OUTPUT FORMAT — return ONLY valid JSON, no other text:
{
  "title": "...",
  "metaDescription": "..."
}`;
}

// ─── suggestCategoryNamePrompt ────────────────────────────────────────────────

/**
 * Generates a prompt to suggest a better category name based on keyword data.
 * The slug NEVER changes — only the display name.
 *
 * @param {object} category - Current category data
 * @param {object} keywords - Keyword data with volumes
 * @returns {string} - Prompt string
 */
function suggestCategoryNamePrompt(category, keywords) {
  const topKeywords = (keywords.rawItems || [])
    .slice(0, 15)
    .map((k) => {
      const kw = k.keyword_data?.keyword || k.keyword || '';
      const vol = k.keyword_data?.keyword_info?.search_volume || k.searchVolume || 0;
      return `"${kw}" (${vol}/mo)`;
    })
    .join(', ');

  return `You are an SEO specialist optimizing product category names for ${SITE_NAME} (${SITE_URL}).

CURRENT CATEGORY NAME: "${category.name}"
CURRENT SLUG: "${category.slug}" (NEVER changes)

TOP KEYWORDS BY SEARCH VOLUME:
${topKeywords || '(no keyword data available)'}

TASK: Suggest the optimal display name for this category that:
1. Matches the highest-volume relevant keyword (or close variant)
2. Reads naturally as a category heading
3. Is concise (2-4 words ideal, max 5 words)
4. Makes sense as a product category label on an e-commerce site
5. Uses title case

IMPORTANT: The slug "${category.slug}" cannot change. If the current name already matches the best keyword, return it unchanged.

OUTPUT FORMAT — return ONLY valid JSON, no other text:
{
  "suggestedName": "...",
  "reason": "Brief explanation of why this name is better (or why it stays the same)",
  "targetKeyword": "The keyword this name targets",
  "targetVolume": 1234,
  "changed": true
}`;
}

// ─── extractFAQQuestionsFromKeywords ──────────────────────────────────────────

/**
 * Derive FAQ question strings from DataForSEO keyword data.
 * Adapted from brand-prompts.js but for category-level questions.
 *
 * @param {object[]} keywords - DataForSEO keyword items
 * @param {string} [categoryName] - Category name for relevance filtering
 * @returns {string[]} - Array of question strings
 */
function extractCategoryFAQQuestions(keywords, categoryName = '') {
  const questions = [];
  const catLower = categoryName.toLowerCase();
  const catWords = catLower.split(/\s+/).filter((w) => w.length > 2);

  for (const kw of keywords) {
    const keyword = kw.keyword || kw.keyword_data?.keyword || '';
    const intent = kw.intent || kw.keyword_data?.search_intent_info?.main_intent || '';
    const volume = kw.searchVolume || kw.keyword_data?.keyword_info?.search_volume || 0;

    if (volume < 10) continue;

    const kwLower = keyword.toLowerCase();
    // Check relevance — at least one category word must appear
    const isRelevant = !categoryName || catWords.some((w) => kwLower.includes(w));

    // Keywords that look like questions
    if (/^(what|how|are|is|can|do|does|why|when|where|which)\b/i.test(keyword)) {
      const q = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      questions.push({q: q.endsWith('?') ? q : q + '?', relevant: isRelevant, volume});
      continue;
    }

    // Informational intent → convert to questions
    if (intent === 'informational' || intent === 'navigational') {
      if (keyword.includes(' vs ') || keyword.includes(' vs. ')) {
        questions.push({
          q: `What is the difference between ${keyword.replace(/ vs\.? /, ' and ')}?`,
          relevant: isRelevant,
          volume,
        });
      } else if (keyword.includes('size') || keyword.includes('sizing') || keyword.includes('fit')) {
        questions.push({
          q: `How do I choose the right size ${keyword.replace(/\s*(siz(e|ing)|fit(ting)?)/i, '').trim()}?`,
          relevant: isRelevant,
          volume,
        });
      } else if (keyword.includes('best')) {
        questions.push({
          q: `What are the ${keyword}?`,
          relevant: isRelevant,
          volume,
        });
      } else if (keyword.includes('review') || keyword.includes('reviews')) {
        questions.push({
          q: `Are ${keyword.replace(/\s*reviews?/i, '')} worth buying?`,
          relevant: isRelevant,
          volume,
        });
      }
    }
  }

  // Prioritize relevant questions, then by volume
  const sorted = questions.sort((a, b) => {
    if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
    return (b.volume || 0) - (a.volume || 0);
  });

  // Deduplicate and cap
  const seen = new Set();
  const result = [];
  for (const item of sorted) {
    if (!seen.has(item.q.toLowerCase())) {
      seen.add(item.q.toLowerCase());
      result.push(item.q);
    }
    if (result.length >= 8) break;
  }

  return result;
}

// ─── buildCategoryInternalLinks ───────────────────────────────────────────────

/**
 * Generates HTML for internal links section (subcategories + related categories).
 *
 * @param {string} categoryName
 * @param {object[]} subcategories - [{name, slug, count}]
 * @param {object[]} relatedCategories - [{name, slug}]
 * @param {string} [baseDomain] - Default: proskatersplace.com
 * @returns {string} - HTML string
 */
function buildCategoryInternalLinks(categoryName, subcategories = [], relatedCategories = [], baseDomain = 'proskatersplace.com') {
  const parts = [];

  if (subcategories.length > 0) {
    const subLinks = subcategories
      .filter((s) => s.url)
      .slice(0, 8)
      .map((s) => {
        return `  <li><a href="${s.url}">${s.name}</a></li>`;
      })
      .join('\n');

    if (subLinks) {
      parts.push(`<div class="category-subcategories">
<h3>Shop ${categoryName} by Type</h3>
<ul>
${subLinks}
</ul>
</div>`);
    }
  }

  if (relatedCategories.length > 0) {
    const relLinks = relatedCategories
      .filter((r) => r.url)
      .slice(0, 6)
      .map((r) => {
        return `<a href="${r.url}" title="Shop ${r.name}">${r.name}</a>`;
      })
      .join(' · ');

    if (relLinks) {
      parts.push(`<p class="category-related-links"><strong>Related categories:</strong> ${relLinks}</p>`);
    }
  }

  // Always add guide link
  parts.push(
    `<p class="category-guide-link">Need help choosing? Try our <a href="https://${baseDomain}/inline-skates-size-calculator/" title="Find your perfect size">Inline Skate Size Calculator</a> or <a href="mailto:info@proskatersplace.com">contact our team</a> for personalized recommendations.</p>`,
  );

  return parts.join('\n');
}

// ─── buildFAQSchema ───────────────────────────────────────────────────────────

/**
 * Converts FAQ array to FAQPage JSON-LD schema.
 *
 * @param {Array<{question: string, answer: string}>} faqs
 * @returns {string} - JSON string (NO script tag — PHP handles that)
 */
function buildFAQSchema(faqs) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
  return JSON.stringify(schema, null, 2);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  categoryDescriptionPrompt,
  categoryBelowContentPrompt,
  categoryFAQPrompt,
  categoryMetaPrompt,
  suggestCategoryNamePrompt,
  extractCategoryContext,
  extractCategoryFAQQuestions,
  buildCategoryInternalLinks,
  buildFAQSchema,
  CATEGORY_RELATIONS,
  SITE_NAME,
  SITE_URL,
  USP_POINTS,
};
