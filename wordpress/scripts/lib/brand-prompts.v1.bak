#!/usr/bin/env node
/**
 * lib/brand-prompts.js
 *
 * Prompt template functions for brand page content generation.
 * Kept separate from script logic so prompts are easy to tweak and test
 * without touching the main optimization script.
 *
 * All prompts follow ProSkaters Place brand voice:
 *   - Authoritative but approachable
 *   - American English spelling (color, center, favorite, gray, etc.)
 *   - US market targeting (primary), worldwide (secondary)
 *   - Focus on expert fitting, authorized dealer, warranty support
 *
 * NOTE: These scripts target proskatersplace.com (US .com site).
 *       The Nuxt/Vue frontend at proskatersplace.ca is a separate Canadian project.
 *
 * Usage in optimize-brand-page.js:
 *   const { brandDescriptionPrompt, brandFAQPrompt, brandMetaPrompt } = require('./lib/brand-prompts');
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_NAME = 'ProSkaters Place';
const SITE_LOCATION = 'North America';
const SITE_URL = 'proskatersplace.com';
const USP_POINTS = [
  'authorized US retailer',
  'expert fitting service available in-store',
  'free shipping on orders over $150 USD',
  'genuine manufacturer warranty on all products',
  'knowledgeable staff with decades of skating experience',
];

// ─── brandDescriptionPrompt ───────────────────────────────────────────────────

/**
 * Generates the main brand page description prompt (targets 400-600 words).
 *
 * @param {object} brand - Brand data from brand-master-list.json
 * @param {string} brand.name - Brand name (e.g., "Chaya Skates")
 * @param {string} brand.slug - URL slug (e.g., "chaya-skates")
 * @param {number} brand.taxonomy.count - Product count in store
 * @param {object} keywords - Keyword targeting data
 * @param {string} keywords.primary - Primary target keyword
 * @param {string[]} keywords.secondary - 5-10 secondary keywords
 * @param {string[]} keywords.longtail - Long-tail keyword list
 * @param {string} keywords.intent - Dominant search intent ('commercial', 'informational', etc.)
 * @param {object[]} products - Top products from WooCommerce API
 * @param {string} products[].name - Product name
 * @param {string} products[].price - Formatted price
 * @returns {string} - Prompt string ready for Gemini
 */
function brandDescriptionPrompt(brand, keywords, products) {
  const {primary, secondary = [], longtail = [], intent = 'commercial'} = keywords;
  const productList = products
    .slice(0, 8)
    .map((p) => `• ${p.name}${p.price ? ` (${p.price})` : ''}`)
    .join('\n');
  const secondaryList = secondary.slice(0, 10).join(', ');
  const longtailList = longtail.slice(0, 5).join(', ');

  return `You are writing the brand description for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), a ${SITE_LOCATION}-based authorized inline skate and roller sports retailer.

TASK: Write a 450-550 word HTML description for the ${brand.name} brand page. This is the main body text that appears on the brand archive page (above or below the product grid).

KEYWORD TARGETING:
- Primary keyword: "${primary}"
- Secondary keywords: ${secondaryList || '(none specified)'}
- Long-tail targets: ${longtailList || '(none specified)'}
- Search intent: ${intent}
- Use the primary keyword naturally 3-5 times. Use secondary keywords where they fit naturally.

⚠️  CRITICAL — RANK MATH CONTENT SCORING:
The very first <p> tag inside the <h2>About ${brand.name}</h2> section is extracted separately
and stored in WordPress as the taxonomy "description" field — this is the ONLY content Rank Math
scores for focus keyword presence. If the primary keyword "${primary}" does not appear in that
first <p>, Rank Math will flag "Focus keyword not found in the first 10% of content" and penalize
the page score. The primary keyword MUST appear naturally in the first sentence or two of that
first paragraph.

CONTENT REQUIREMENTS — use ALL four H2 sections below:
1. <h2>About ${brand.name}</h2> (1-2 paragraphs): What ${brand.name} is known for, their heritage/expertise, and what makes their products stand out. Be specific and factual — avoid generic praise.
2. <h2>Why Buy ${brand.name} at ${SITE_NAME}?</h2> (1 paragraph): Lead with the authorized dealer angle — we are an official US ${brand.name} dealer. Cover expert staff, in-store fitting service, genuine manufacturer warranty, and free US shipping on orders over $150 USD. This is the most commercially important section — make it persuasive without being generic.
3. <h2>${brand.name} Products at ProSkaters Place</h2> (1 paragraph + optional list): Name the actual products we carry (listed below). Say which type of skater each line suits.
4. <h2>Expert Advice & Support</h2> (1-2 sentences CTA): Invite visitors to contact us for personalized recommendations or sizing help.

PRODUCTS WE CARRY:
${productList || '(product list not available — write generically about the brand range)'}

TONE & STYLE:
- Authoritative but approachable — like advice from an expert skate shop owner
- Use American English spelling: color, favorite, center, gray, aluminum, organize
- Primary audience: US customers. Secondary: international/worldwide
- Do NOT start with the brand name as the first word
- Do NOT use phrases like "Introduction", "In Conclusion", "Look no further", "One-stop shop"
- Do NOT use filler phrases like "Whether you're a beginner or expert"
- Paragraphs max 100 words each
- No markdown — output clean HTML only

HTML FORMAT:
- Use the four <h2> headings specified above (do not rename them — exact text matters for consistency)
- Use <p> tags for paragraphs
- Use <strong> for 1-2 key brand claims per section
- Use a <ul> list for product lines if it improves scannability
- Do NOT include <h1> — the brand name H1 is already in the page template

OUTPUT: HTML only — no intro, no explanation. Start with the first <h2>.`;
}

// ─── brandFAQPrompt ───────────────────────────────────────────────────────────

/**
 * Generates a FAQ section prompt (3-5 Q&A pairs).
 * FAQ questions are derived from DataForSEO keyword data (informational intent keywords,
 * related searches) to maximize FAQ rich result chances.
 *
 * @param {object} brand - Brand data
 * @param {string[]} faqQuestions - Question strings from DataForSEO (informational keywords)
 * @returns {string} - Prompt string
 */
function brandFAQPrompt(brand, faqQuestions = []) {
  const questionList =
    faqQuestions.length > 0
      ? faqQuestions
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')
      : `1. Where can I buy ${brand.name} skates in the US?
2. Is ProSkaters Place an authorized ${brand.name} dealer?
3. Do ${brand.name} products come with a warranty when bought at ProSkaters Place?
4. How do I choose the right size ${brand.name} skates?
5. Does ProSkaters Place offer ${brand.name} fitting assistance?
6. Are ${brand.name} skates good for beginners?`;

  return `You are writing a FAQ section for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), a US-based inline skate and roller sports retailer shipping worldwide.

TASK: Write a FAQ section with 4 to 6 question-and-answer pairs.

REQUIRED: At least one Q&A must target the "where to buy" / "authorized dealer" intent — e.g. "Where can I buy ${brand.name} skates?", "Is ProSkaters Place an authorized ${brand.name} retailer?". This targets high-converting local purchase intent searches.

BASE REMAINING QUESTIONS ON (answer the most relevant ones):
${questionList}

GUIDELINES:
- Each answer: 40-80 words, direct and helpful
- Mention ${SITE_NAME} or "we" naturally in 2-3 answers
- US-focused context (USD pricing, ships to USA and worldwide, free shipping over $150 USD)
- Use American English spelling
- Answers should be genuinely useful — not marketing fluff
- Do not repeat information already covered in the brand description

OUTPUT FORMAT — return ONLY a valid JSON array, no other text:
[
  {"question": "Question text here?", "answer": "Answer text here."},
  {"question": "Question text here?", "answer": "Answer text here."}
]`;
}

// ─── brandMetaPrompt ──────────────────────────────────────────────────────────

/**
 * Generates meta title + description for a brand page.
 *
 * @param {object} brand - Brand data
 * @param {string} primaryKeyword - The main keyword to feature
 * @returns {string} - Prompt string
 */
function brandMetaPrompt(brand, primaryKeyword) {
  return `You are an SEO specialist writing Rank Math meta tags for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), an authorized US inline skate and roller sports retailer shipping worldwide.

TASK: Write an SEO title and meta description that will be saved directly into Rank Math's title and description fields.

TARGET KEYWORD: "${primaryKeyword}"
BRAND: ${brand.name}
SITE: ${SITE_NAME}
CONTEXT: ${brand.taxonomy?.count || 'multiple'} ${brand.name} products in stock, authorized US dealer

TITLE REQUIREMENTS (Rank Math will flag violations):
- MUST be 50–60 characters including spaces — this is a hard range, not a suggestion
- The focus keyword "${primaryKeyword}" MUST appear toward the START of the title (first half)
- Include a brand differentiator: "Authorized US Dealer", "Official Retailer", "ProSkaters Place", etc.
- Suggested format: "${primaryKeyword} | ProSkaters Place" or "Buy ${primaryKeyword} - Authorized US Dealer"
- No pipes or dashes at the very end
- Count characters carefully before outputting — truncate or expand until it lands in 50–60

META DESCRIPTION REQUIREMENTS (Rank Math will flag violations):
- MUST be 150–160 characters including spaces — hard range, not a suggestion
- Include "${primaryKeyword}" naturally (Google bolds it in search results)
- End with a specific CTA — choose one: "Free US shipping over $150.", "Shop now.", "Expert fitting available."
- Mention the authorized dealer angle or warranty at least once
- Count characters carefully before outputting — pad or trim until it lands in 150–160

OUTPUT FORMAT — return ONLY valid JSON, no other text:
{
  "title": "...",
  "metaDescription": "..."
}`;
}

// ─── buildFAQSchema ────────────────────────────────────────────────────────────

/**
 * Converts an array of FAQ objects into a FAQPage JSON-LD schema block.
 *
 * @param {Array<{question: string, answer: string}>} faqs
 * @returns {string} - Complete <script> tag with JSON-LD
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

  return `\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

// ─── buildAuthorizedBadge ──────────────────────────────────────────────────────

/**
 * Returns the authorized retailer HTML badge to prepend to descriptions.
 *
 * @param {string} brandName
 * @returns {string} - HTML string
 */
function buildAuthorizedBadge(brandName) {
  return `<p class="authorized-retailer-badge"><strong>✓ Authorized US ${brandName} Retailer</strong> — ProSkaters Place is an official ${brandName} dealer, ensuring you receive genuine products with full manufacturer warranty support.</p>\n`;
}

// ─── buildInternalLinks ────────────────────────────────────────────────────────

/**
 * Generates HTML for an internal product links section.
 *
 * @param {string} brandName
 * @param {object[]} products - Top 4-5 WooCommerce products
 * @param {object[]} categories - Relevant category links [{name, slug}]
 * @returns {string} - HTML string
 */
function buildInternalLinks(brandName, products = [], categories = []) {
  const parts = [];

  if (products.length > 0) {
    const productLinks = products
      .slice(0, 5)
      .map((p) => `<li><a href="${p.permalink}">${p.name}</a></li>`)
      .join('\n    ');

    parts.push(`<div class="brand-featured-products">
  <p><strong>Featured ${brandName} Products:</strong></p>
  <ul>
    ${productLinks}
  </ul>
</div>`);
  }

  if (categories.length > 0) {
    // Support both product-category slugs and custom URL overrides (e.g. guide pages)
    const catLinks = categories
      .map((c) => {
        const href = c.url || `/product-category/${c.slug}/`;
        return `<a href="${href}" title="${c.title || 'Shop ' + c.name}">${c.name}</a>`;
      })
      .join(' · ');
    parts.push(`<p class="brand-category-links"><strong>Shop by category:</strong> ${catLinks}</p>`);
  }

  return parts.join('\n');
}

// ─── extractFAQQuestionsFromKeywords ──────────────────────────────────────────

/**
 * Derive FAQ question strings from DataForSEO keyword data.
 * Informational-intent keywords + question-like keywords become FAQ questions.
 *
 * @param {object[]} keywords - DataForSEO keyword items
 * @returns {string[]} - Array of question strings
 */
function extractFAQQuestionsFromKeywords(keywords) {
  const questions = [];

  for (const kw of keywords) {
    const keyword = kw.keyword || kw.keyword_data?.keyword || '';
    const intent = kw.intent || kw.keyword_data?.search_intent_info?.main_intent || '';
    const volume = kw.searchVolume || kw.keyword_data?.keyword_info?.search_volume || 0;

    if (volume < 10) continue;

    // Keywords that look like questions
    if (/^(what|how|are|is|can|do|does|why|when|where|which)\b/i.test(keyword)) {
      const q = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      questions.push(q.endsWith('?') ? q : q + '?');
      continue;
    }

    // Informational intent keywords can be turned into questions
    if (intent === 'informational' || intent === 'navigational') {
      if (keyword.includes(' vs ') || keyword.includes(' vs. ')) {
        questions.push(`What is the difference between ${keyword.replace(/ vs\.? /, ' and ')}?`);
      } else if (keyword.includes('review') || keyword.includes('reviews')) {
        questions.push(`Are ${keyword.replace(/\s*reviews?/i, '')} worth it?`);
      } else if (keyword.includes('size') || keyword.includes('sizing')) {
        questions.push(`How do I choose the right size ${keyword.replace(/\s*siz(e|ing)/i, '').trim()} skates?`);
      }
    }
  }

  // Deduplicate and cap
  return [...new Set(questions)].slice(0, 8);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  brandDescriptionPrompt,
  brandFAQPrompt,
  brandMetaPrompt,
  buildFAQSchema,
  buildAuthorizedBadge,
  buildInternalLinks,
  extractFAQQuestionsFromKeywords,
  SITE_NAME,
  USP_POINTS,
};
