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
 * v2 — March 2026 overhaul:
 *   - Removed product section from Gemini prompt (no more hallucinated product links)
 *   - Added extractBrandContext() to pull real facts from existing WP descriptions
 *   - Added BRAND_WEBSITE_MAP for guaranteed official site links
 *   - Prompts now receive real brand facts (founders, country, website)
 *   - DataForSEO keyword data integrated into prompt context
 *   - FAQ questions driven by actual search data, not generic templates
 *
 * Usage in optimize-brand-page.js:
 *   const { brandDescriptionPrompt, brandFAQPrompt, brandMetaPrompt,
 *           extractBrandContext, buildFAQSchema, buildAuthorizedBadge,
 *           buildInternalLinks, extractFAQQuestionsFromKeywords } = require('./lib/brand-prompts');
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

// ─── Known Brand Websites (fallback when not in taxonomy description) ─────────
// Key = brand slug (as it appears on proskatersplace.com)
// These are only used when extractBrandContext() can't find a URL in the existing description.

const BRAND_WEBSITE_MAP = {
  adapt: 'https://www.adaptbrand.com/',
  'chaya-skates': 'https://www.chaya-brand.com/',
  powerslide: 'https://www.powerslide.com/',
  rollerblade: 'https://www.rollerblade.com/',
  seba: 'https://www.sebaskates.com/',
  'fr-skates': 'https://www.yourskates.com/',
  'flying-eagle': 'https://www.flyingeagleskates.com/',
  'usd-skates': 'https://www.usd-skate.com/',
  luminous: 'https://www.luminouswheels.com/',
  ennui: 'https://www.ennui.eu/',
  micro: 'https://www.micro-skate.com/',
  'rio-roller': 'https://www.rioroller.com/',
  'sfr-skates': 'https://www.sfrskates.com/',
  rekd: 'https://www.rekdprotection.com/',
  playlife: 'https://www.powerslide.com/playlife/',
  k2: 'https://k2skates.com/',
  roces: 'https://www.roces.com/',
  impala: 'https://www.impalarollerskates.com/',
  moxi: 'https://www.moxiskates.com/',
  bauer: 'https://www.bauer.com/',
  fischer: 'https://www.fischer-ski.com/',
  'rossignol-ski': 'https://www.rossignol.com/',
  swix: 'https://www.swixsport.com/',
  toko: 'https://www.toko.ch/',
  daehlie: 'https://www.daehlie.com/',
  kizer: 'https://www.kframesonline.com/',
  myfit: 'https://www.powerslide.com/myfit/',
  gawds: 'https://www.gframesonline.com/',
  'undercover-wheels': 'https://www.ucwheels.com/',
  'endless-blading': 'https://www.endlessblading.com/',
  'nn-skates': 'https://www.nnskates.com/',
  sidas: 'https://www.sidas.com/',
  twincam: 'https://www.twincam.com/',
  'summit-skiboards': 'https://www.summitskiboards.com/',
  razor: 'https://www.razor.com/',
  'epic-grindshoes': 'https://www.epicgrindshoes.com/',
  'anarchy-aggressive': 'https://anarchy-skates.com/',
  'dream-wheels': 'https://www.dreamwheelco.com/',
  'mini-logo': 'https://minilogoskateboards.com/',
  'lang-boots': 'https://www.langboots.com/',
};

// ─── extractBrandContext ──────────────────────────────────────────────────────

/**
 * Parses the existing WordPress taxonomy description to extract real brand facts.
 * Many existing descriptions already contain official website links, founding info,
 * country of origin, and key claims — we pass these to Gemini as grounding facts.
 *
 * @param {string} html - The existing taxonomy description HTML
 * @param {string} brandSlug - Brand slug for BRAND_WEBSITE_MAP fallback
 * @returns {object} - { websiteUrl, origin, founders, claims, rawText, hasExistingContent }
 */
function extractBrandContext(html, brandSlug) {
  const context = {
    websiteUrl: null,
    origin: null,
    founders: null,
    claims: [],
    rawText: '',
    hasExistingContent: false,
  };

  if (!html || html.trim().length < 20) {
    // Even with no existing content, try the website map
    if (BRAND_WEBSITE_MAP[brandSlug]) {
      context.websiteUrl = BRAND_WEBSITE_MAP[brandSlug];
    }
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

  // Extract external website URLs (skip proskatersplace links)
  const linkMatches = html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi);
  for (const match of linkMatches) {
    const url = match[1];
    if (url && !url.includes('proskatersplace') && !url.startsWith('/') && !url.startsWith('#') && url.startsWith('http')) {
      context.websiteUrl = url;
      break; // Take the first external URL as the official site
    }
  }

  // Fallback to BRAND_WEBSITE_MAP
  if (!context.websiteUrl && BRAND_WEBSITE_MAP[brandSlug]) {
    context.websiteUrl = BRAND_WEBSITE_MAP[brandSlug];
  }

  // Try to extract country/origin (patterns like "Dutch company", "French brand", "German manufacturer")
  const originPatterns = [
    /\b(Dutch|German|French|Italian|American|Canadian|British|Swiss|Swedish|Norwegian|Japanese|Korean|Australian|Spanish|Czech|Polish|Taiwanese|Chinese)\b\s+(company|brand|manufacturer|boot company|wheel company|firm)/i,
    /\b(?:based|founded|headquartered)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  ];
  for (const pattern of originPatterns) {
    const match = context.rawText.match(pattern);
    if (match) {
      context.origin = match[0];
      break;
    }
  }

  // Try to extract founder names (patterns like "founded by X and Y", "created by X")
  const founderPatterns = [
    /(?:founded|created|started|established)\s+by\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+\s+[A-Z][a-z]+)?)/i,
    /(?:founded|created|started|established)\s+by\s+(.+?)(?:\.|,|<|$)/i,
  ];
  for (const pattern of founderPatterns) {
    const match = context.rawText.match(pattern);
    if (match) {
      context.founders = match[1].trim().replace(/\.$/, '');
      break;
    }
  }

  // Extract key claims (e.g., "only North American partner", "exclusive dealer")
  const claimPatterns = [
    /(?:only|exclusive|first|official|sole)\s+(?:North American|US|American|Canadian|worldwide)\s+(?:partner|dealer|distributor|retailer)/gi,
    /authorized\s+(?:dealer|retailer|partner|distributor)/gi,
    /\b(?:award[- ]winning|industry[- ]leading|pioneering|innovative)\b/gi,
  ];
  for (const pattern of claimPatterns) {
    const matches = context.rawText.match(pattern);
    if (matches) context.claims.push(...matches);
  }

  return context;
}

// ─── brandDescriptionPrompt ───────────────────────────────────────────────────

/**
 * Generates the main brand page description prompt (targets 400-550 words).
 *
 * v2: Removed "Products at ProSkaters Place" section (was causing duplicates).
 *     Real product links are added by buildInternalLinks() in the assembly step.
 *     Added brand context (website, founders, origin) from existing WP data.
 *     Added DataForSEO keyword metrics for smarter targeting.
 *
 * @param {object} brand - Brand data from brand-master-list.json
 * @param {object} keywords - Keyword targeting data
 * @param {object} brandContext - From extractBrandContext()
 * @param {object} [options] - Additional options
 * @param {boolean} [options.isAuthorized] - Whether we're an authorized dealer
 * @param {number} [options.productCount] - Real product count from scrape
 * @param {string[]} [options.productCategories] - Category names the brand has products in
 * @returns {string} - Prompt string ready for Gemini
 */
function brandDescriptionPrompt(brand, keywords, brandContext, options = {}) {
  const {primary, secondary = [], longtail = [], intent = 'commercial'} = keywords;
  const secondaryList = secondary.slice(0, 10).join(', ');
  const longtailList = longtail.slice(0, 5).join(', ');
  const isAuthorized = options.isAuthorized ?? false;
  const productCount = options.productCount ?? brand.taxonomy?.count ?? 0;
  const productCategories = options.productCategories || [];

  // Build brand context block for Gemini grounding
  const contextLines = [];
  if (brandContext.websiteUrl) {
    contextLines.push(`- Official website: ${brandContext.websiteUrl}`);
  }
  if (brandContext.origin) {
    contextLines.push(`- Origin: ${brandContext.origin}`);
  }
  if (brandContext.founders) {
    contextLines.push(`- Founded by: ${brandContext.founders}`);
  }
  if (brandContext.claims.length > 0) {
    contextLines.push(`- Key claims: ${brandContext.claims.join('; ')}`);
  }
  if (brandContext.rawText && brandContext.rawText.length > 30) {
    // Give Gemini the existing description text as factual grounding
    const truncated = brandContext.rawText.length > 500 ? brandContext.rawText.slice(0, 500) + '...' : brandContext.rawText;
    contextLines.push(`- Existing description (factual source): "${truncated}"`);
  }

  const brandContextBlock =
    contextLines.length > 0
      ? `\nBRAND CONTEXT — use these REAL facts (do NOT invent brand history or claims):\n${contextLines.join('\n')}\n`
      : `\nBRAND CONTEXT: No existing description found. Use your knowledge of ${brand.name} but stay factual — if unsure about founding year, country of origin, or specific claims, write about the brand's product line and reputation in the skating community instead.\n`;

  // Build the authorized dealer section guidance
  const dealerGuidance = isAuthorized
    ? `Lead with the authorized dealer angle — we are an official US ${brand.name} dealer. Cover expert staff, in-store fitting service, genuine manufacturer warranty, and free US shipping on orders over $150 USD. This is the most commercially important section — make it persuasive.`
    : `Focus on our expertise with ${brand.name} products, our knowledgeable staff, free US shipping over $150, and hassle-free returns. Do NOT claim "authorized dealer" or "official dealer" status — instead emphasize our quality guarantee and customer service.`;

  // Category context
  const categoryContext =
    productCategories.length > 0
      ? `We carry ${brand.name} products in these categories: ${productCategories.join(', ')}.`
      : `We carry ${productCount} ${brand.name} products.`;

  return `You are writing the brand description for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), a ${SITE_LOCATION}-based inline skate and roller sports retailer.

TASK: Write a 400-550 word HTML description for the ${brand.name} brand page. This is the main body text that appears on the brand archive page.
${brandContextBlock}
KEYWORD TARGETING:
- Primary keyword: "${primary}"
- Secondary keywords: ${secondaryList || '(none specified)'}
- Long-tail targets: ${longtailList || '(none specified)'}
- Search intent: ${intent}
- Use the primary keyword naturally 3-5 times. Use secondary keywords where they fit naturally.

⚠️  CRITICAL — RANK MATH CONTENT SCORING:
The very first <p> tag inside the <h2>About ${brand.name}</h2> section is extracted separately
and stored in WordPress as the taxonomy "description" field — this is the ONLY content Rank Math
scores for focus keyword presence. The primary keyword "${primary}" MUST appear naturally in the
first sentence or two of that first paragraph.

⚠️  CRITICAL — FACTUAL ACCURACY:
- Only state facts about the brand that are in the BRAND CONTEXT above or that you are CERTAIN about
- If you include founding year, country, or founder names — they MUST come from the BRAND CONTEXT section
- Do NOT invent brand history, founding stories, or specific claims you're not sure about
- If the brand context is limited, focus on the brand's reputation, product quality, and what type of skater it serves${brandContext.websiteUrl ? `\n- INCLUDE this outbound link in the About section: <a href="${brandContext.websiteUrl}" target="_blank" rel="noopener">${brand.name} official site</a>` : ''}

CONTENT REQUIREMENTS — use ALL three H2 sections below (and ONLY these three):

1. <h2>About ${brand.name}</h2> (2-3 paragraphs): What ${brand.name} is known for, their heritage/expertise, and what makes their products stand out. Use the BRAND CONTEXT facts above. Be specific and factual.${brandContext.websiteUrl ? ` Include a link to the brand's official website.` : ''}

2. <h2>Why Buy ${brand.name} at ${SITE_NAME}?</h2> (1-2 paragraphs): ${dealerGuidance} ${categoryContext}

3. <h2>Expert Advice & ${brand.name} Support</h2> (1 paragraph CTA): Invite visitors to contact us at info@proskatersplace.com for personalized ${brand.name} recommendations, sizing help, or questions about specific products. Mention our team has hands-on experience with the ${brand.name} product line.

⚠️  DO NOT include a "Products at ProSkaters Place" or "Featured Products" section — product links are handled separately and will be added below your content automatically.

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
- Use the three <h2> headings specified above (do not rename them)
- Use <p> tags for paragraphs
- Use <strong> for 1-2 key brand claims per section
- Do NOT include <h1> — the brand name H1 is already in the page template

OUTPUT: HTML only — no intro, no explanation. Start with the first <h2>.`;
}

// ─── brandFAQPrompt ───────────────────────────────────────────────────────────

/**
 * Generates a FAQ section prompt (4-6 Q&A pairs).
 * FAQ questions are derived from DataForSEO keyword data (informational intent keywords,
 * related searches) to maximize FAQ rich result chances.
 *
 * v2: Questions are now brand-specific, not generic.
 *     Always includes a "where to buy" question for local purchase intent.
 *     Uses DataForSEO search volume hints to prioritize high-value questions.
 *
 * @param {object} brand - Brand data
 * @param {string[]} faqQuestions - Question strings from DataForSEO (informational keywords)
 * @param {object} [brandContext] - From extractBrandContext()
 * @returns {string} - Prompt string
 */
function brandFAQPrompt(brand, faqQuestions = [], brandContext = {}) {
  const questionList =
    faqQuestions.length > 0
      ? faqQuestions
          .slice(0, 8)
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n')
      : `1. Where can I buy ${brand.name} products in the US?
2. Is ProSkaters Place an authorized ${brand.name} dealer?
3. Do ${brand.name} products come with a warranty when bought at ProSkaters Place?
4. How do I choose the right size for ${brand.name} products?
5. Does ProSkaters Place offer ${brand.name} fitting assistance?
6. What makes ${brand.name} different from other brands?`;

  const brandFacts = brandContext?.rawText ? `\nBRAND FACTS TO REFERENCE: "${brandContext.rawText.slice(0, 300)}"` : '';

  return `You are writing a FAQ section for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), a US-based inline skate and roller sports retailer shipping worldwide.

TASK: Write a FAQ section with 4 to 6 question-and-answer pairs specifically about ${brand.name}.
${brandFacts}

REQUIRED: At least one Q&A MUST target the "where to buy" / "authorized dealer" intent — this targets high-converting local purchase intent searches.

REQUIRED: Every question MUST mention "${brand.name}" by name — no generic questions like "What size skates should I get?" (too generic). Instead: "How do I find my ${brand.name} size?"

BASE REMAINING QUESTIONS ON (answer the most relevant ones):
${questionList}

GUIDELINES:
- Each answer: 40-80 words, direct and helpful
- Mention ${SITE_NAME} or "we" naturally in 2-3 answers
- US-focused context (USD pricing, ships to USA and worldwide, free shipping over $150 USD)
- Use American English spelling
- Answers should be genuinely useful — not marketing fluff
- Do not repeat information already covered in the brand description
- If you reference brand facts (founding, country, product types), use ONLY the BRAND FACTS above

OUTPUT FORMAT — return ONLY a valid JSON array, no other text:
[
  {"question": "Question mentioning ${brand.name}?", "answer": "Answer text here."},
  {"question": "Question mentioning ${brand.name}?", "answer": "Answer text here."}
]`;
}

// ─── brandMetaPrompt ──────────────────────────────────────────────────────────

/**
 * Generates meta title + description for a brand page.
 * v2: Primary keyword is now brand-specific (e.g., "Adapt skates") not generic.
 *
 * @param {object} brand - Brand data
 * @param {string} primaryKeyword - The main keyword to feature (should be brand-specific)
 * @param {object} [options]
 * @param {boolean} [options.isAuthorized] - Whether authorized dealer
 * @returns {string} - Prompt string
 */
function brandMetaPrompt(brand, primaryKeyword, options = {}) {
  const isAuthorized = options.isAuthorized ?? false;
  const dealerPhrase = isAuthorized ? 'Authorized US Dealer' : 'Official US Retailer';

  return `You are an SEO specialist writing Rank Math meta tags for the ${brand.name} brand page on ${SITE_NAME} (${SITE_URL}), a US inline skate and roller sports retailer shipping worldwide.

TASK: Write an SEO title and meta description that will be saved directly into Rank Math's title and description fields.

TARGET KEYWORD: "${primaryKeyword}"
BRAND: ${brand.name}
SITE: ${SITE_NAME}
CONTEXT: ${brand.taxonomy?.count || 'multiple'} ${brand.name} products in stock, ${isAuthorized ? 'authorized US dealer' : 'trusted US retailer'}

TITLE REQUIREMENTS (Rank Math will flag violations):
- MUST be 50–60 characters including spaces — this is a hard range, not a suggestion
- The focus keyword "${primaryKeyword}" MUST appear toward the START of the title (first half)
- Include a brand differentiator: "${dealerPhrase}", "${SITE_NAME}", etc.
- Suggested format: "${primaryKeyword} | ${SITE_NAME}" or "Buy ${primaryKeyword} - ${dealerPhrase}"
- No pipes or dashes at the very end
- Count characters carefully before outputting — truncate or expand until it lands in 50–60

META DESCRIPTION REQUIREMENTS (Rank Math will flag violations):
- MUST be 150–160 characters including spaces — hard range, not a suggestion
- Include "${primaryKeyword}" naturally (Google bolds it in search results)
- End with a specific CTA — choose one: "Free US shipping over $150.", "Shop now.", "Expert fitting available."
- Mention the ${isAuthorized ? 'authorized dealer angle' : 'expertise and quality guarantee'} at least once
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
 * v2: Now requires validated brand-specific products only.
 *     Product URLs are normalized to the live site domain.
 *     Category links are filtered to only categories the brand has products in.
 *
 * @param {string} brandName
 * @param {object[]} products - Verified brand-specific products from scrape
 * @param {object[]} categories - Relevant category links [{name, slug, url?}]
 * @param {string} [baseDomain] - Domain to normalize links to (default: proskatersplace.com)
 * @returns {string} - HTML string
 */
function buildInternalLinks(brandName, products = [], categories = [], baseDomain = 'proskatersplace.com') {
  const parts = [];

  if (products.length > 0) {
    const productLinks = products
      .slice(0, 6)
      .map((p) => {
        // Normalize URL to ensure it points to the correct domain
        let href = p.url || p.permalink || '#';
        if (href.startsWith('/')) {
          href = `https://${baseDomain}${href}`;
        } else if (href.includes('test.')) {
          href = href.replace(/test\.proskatersplace\.com/, baseDomain);
        }
        const priceTag = p.price ? ` — $${p.price}` : '';
        return `  <li><a href="${href}">${p.name}</a>${priceTag}</li>`;
      })
      .join('\n');

    parts.push(`<div class="brand-featured-products">
<h3>Popular ${brandName} Products</h3>
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
        const fullHref = href.startsWith('http') ? href : `https://${baseDomain}${href.startsWith('/') ? href : '/' + href}`;
        return `<a href="${fullHref}" title="${c.title || 'Shop ' + c.name}">${c.name}</a>`;
      })
      .join(' · ');
    parts.push(`<p class="brand-category-links"><strong>Shop by category:</strong> ${catLinks}</p>`);
  }

  // Always add a guide link
  parts.push(
    `<p class="brand-guide-link">Need help choosing? Try our <a href="https://${baseDomain}/inline-skates-size-calculator/" title="Find your perfect inline skate size">Inline Skate Size Calculator</a> or <a href="mailto:info@proskatersplace.com">contact our team</a> for personalized recommendations.</p>`,
  );

  return parts.join('\n');
}

// ─── extractFAQQuestionsFromKeywords ──────────────────────────────────────────

/**
 * Derive FAQ question strings from DataForSEO keyword data.
 * Informational-intent keywords + question-like keywords become FAQ questions.
 *
 * v2: Now filters to ensure questions are brand-relevant (contain brand name or product type).
 *     Prioritizes branded questions over generic ones.
 *
 * @param {object[]} keywords - DataForSEO keyword items
 * @param {string} [brandName] - Brand name to check relevance
 * @returns {string[]} - Array of question strings
 */
function extractFAQQuestionsFromKeywords(keywords, brandName = '') {
  const questions = [];
  const brandLower = brandName.toLowerCase();
  // Allow a "short" brand name derived by removing common suffixes
  const brandShort = brandLower.replace(/\s*(skates?|brand|wheels?|blading)\s*$/i, '').trim();

  for (const kw of keywords) {
    const keyword = kw.keyword || kw.keyword_data?.keyword || '';
    const intent = kw.intent || kw.keyword_data?.search_intent_info?.main_intent || '';
    const volume = kw.searchVolume || kw.keyword_data?.keyword_info?.search_volume || 0;

    if (volume < 10) continue;

    const kwLower = keyword.toLowerCase();
    // Check if keyword is related to this brand
    const isBrandRelated = !brandName || kwLower.includes(brandLower) || (brandShort.length > 2 && kwLower.includes(brandShort));

    // Keywords that look like questions
    if (/^(what|how|are|is|can|do|does|why|when|where|which)\b/i.test(keyword)) {
      const q = keyword.charAt(0).toUpperCase() + keyword.slice(1);
      questions.push({q: q.endsWith('?') ? q : q + '?', branded: isBrandRelated, volume});
      continue;
    }

    // Informational intent keywords can be turned into questions
    if (intent === 'informational' || intent === 'navigational') {
      if (keyword.includes(' vs ') || keyword.includes(' vs. ')) {
        questions.push({
          q: `What is the difference between ${keyword.replace(/ vs\.? /, ' and ')}?`,
          branded: isBrandRelated,
          volume,
        });
      } else if (keyword.includes('review') || keyword.includes('reviews')) {
        questions.push({
          q: `Are ${keyword.replace(/\s*reviews?/i, '')} worth it?`,
          branded: isBrandRelated,
          volume,
        });
      } else if (keyword.includes('size') || keyword.includes('sizing')) {
        questions.push({
          q: `How do I choose the right size for ${keyword.replace(/\s*siz(e|ing)/i, '').trim()}?`,
          branded: isBrandRelated,
          volume,
        });
      }
    }
  }

  // Prioritize brand-related questions, then by volume
  const sorted = questions.sort((a, b) => {
    if (a.branded !== b.branded) return a.branded ? -1 : 1;
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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  brandDescriptionPrompt,
  brandFAQPrompt,
  brandMetaPrompt,
  buildFAQSchema,
  buildAuthorizedBadge,
  buildInternalLinks,
  extractBrandContext,
  extractFAQQuestionsFromKeywords,
  BRAND_WEBSITE_MAP,
  SITE_NAME,
  SITE_URL,
  USP_POINTS,
};
