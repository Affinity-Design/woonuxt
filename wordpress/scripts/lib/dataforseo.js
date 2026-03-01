#!/usr/bin/env node
/**
 * lib/dataforseo.js
 * Shared DataForSEO API helper for SEO automation scripts.
 *
 * Usage in scripts:
 *   const { rankedKeywords, keywordsForSite, relatedKeywords,
 *           keywordSuggestions, searchVolume, onPageAudit,
 *           historicalRankOverview } = require('./lib/dataforseo');
 *
 * Env vars:
 *   DATAFORSEO_LOGIN=your_login_email
 *   DATAFORSEO_PASSWORD=your_api_password
 *
 * Docs: https://docs.dataforseo.com/v3/
 * Dashboard: https://app.dataforseo.com/api-access
 *
 * Pricing notes (as of Feb 2026):
 *   - DataForSEO Labs endpoints: ~$0.05-$0.10 per request
 *   - OnPage API: ~$0.015 per page crawled
 *   - Keywords Data (search volume): ~$0.05 per request
 *   - All costs in USD, check https://dataforseo.com/pricing
 */

require('dotenv').config();
const fetch = require('node-fetch');

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.dataforseo.com/v3';

// Rate limiting: DataForSEO allows 2000 req/min, but for batch scripts
// we throttle to avoid burning budget. Default: 30 req/min.
const RPM = parseInt(process.env.DATAFORSEO_RPM || '30', 10);
const MIN_DELAY_MS = Math.ceil(60000 / RPM);

// Retry config — DataForSEO can return 500/503 on heavy load
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

// Default location/language — US .com site, primary market: USA, secondary: worldwide
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE_CODE = 'en';
const CANADA_LOCATION_CODE = 2124; // Canada (kept for reference — used by .ca frontend)

// ─── Auth ─────────────────────────────────────────────────────────────────────

const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;

if (!login || !password) {
  throw new Error('[dataforseo.js] Missing credentials — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env');
}

const AUTH = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

// ─── Rate-limiting state ──────────────────────────────────────────────────────

let lastCallAt = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastCallAt = Date.now();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status) {
  return status === 429 || status === 500 || status === 503;
}

/**
 * Core API call with rate limiting, retries, and error handling.
 * @param {string} endpoint - API path (e.g., '/dataforseo_labs/google/ranked_keywords/live')
 * @param {Array} payload - Array of task objects
 * @returns {Promise<object>} - Parsed API response
 */
async function apiCall(endpoint, payload) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: AUTH,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`  ⚠️  DataForSEO ${res.status} on attempt ${attempt + 1}/${MAX_RETRIES + 1} — retrying in ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`DataForSEO API error ${res.status}: ${body.slice(0, 500)}`);
      }

      const json = await res.json();

      // Check for task-level errors
      if (json.tasks?.[0]?.status_code >= 40000) {
        throw new Error(`DataForSEO task error ${json.tasks[0].status_code}: ${json.tasks[0].status_message}`);
      }

      return json;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;

      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`  ⚠️  Network error on attempt ${attempt + 1} — retrying in ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }

      throw err;
    }
  }
}

// ─── DataForSEO Labs: Competitor Research ─────────────────────────────────────

/**
 * Get all keywords a domain or specific URL ranks for.
 * Perfect for: "What keywords does /brand/chaya-skates/ rank for?"
 *
 * Endpoint: POST /dataforseo_labs/google/ranked_keywords/live
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live/
 *
 * @param {string} target - Domain or URL (e.g., 'proskatersplace.com/brand/chaya-skates/')
 * @param {object} [options]
 * @param {number} [options.locationCode] - Location code (default: 2840 US)
 * @param {string} [options.languageCode] - Language code (default: 'en')
 * @param {number} [options.limit] - Max results (default: 100, max: 1000)
 * @param {number} [options.offset] - Offset for pagination (default: 0)
 * @param {Array}  [options.filters] - DataForSEO filter array
 * @param {Array}  [options.orderBy] - Sort rules
 * @param {string} [options.historicalSerpMode] - 'live', 'lost', or 'all' (default: 'live')
 * @returns {Promise<object>} - { metrics, items, totalCount }
 */
async function rankedKeywords(target, options = {}) {
  const payload = [
    {
      target,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
      limit: options.limit || 100,
      offset: options.offset || 0,
      item_types: ['organic'],
      ...(options.filters ? {filters: options.filters} : {}),
      ...(options.orderBy ? {order_by: options.orderBy} : {}),
      ...(options.historicalSerpMode ? {historical_serp_mode: options.historicalSerpMode} : {}),
    },
  ];

  const res = await apiCall('/dataforseo_labs/google/ranked_keywords/live', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    metrics: result?.metrics || {},
    items: result?.items || [],
    totalCount: result?.total_count || 0,
    cost: res.cost || 0,
  };
}

/**
 * Get all ranked keywords with automatic pagination.
 * Fetches ALL keywords (up to maxResults) by paginating in batches of 1000.
 *
 * @param {string} target
 * @param {object} [options] - Same as rankedKeywords, plus maxResults
 * @param {number} [options.maxResults] - Total max to fetch (default: 5000)
 * @returns {Promise<object>} - { metrics, items, totalCount, cost }
 */
async function rankedKeywordsAll(target, options = {}) {
  const maxResults = options.maxResults || 5000;
  const batchSize = 1000;
  let allItems = [];
  let offset = 0;
  let metrics = {};
  let totalCount = 0;
  let totalCost = 0;

  while (offset < maxResults) {
    const limit = Math.min(batchSize, maxResults - offset);
    const res = await rankedKeywords(target, {...options, limit, offset});

    metrics = res.metrics;
    totalCount = res.totalCount;
    totalCost += res.cost;
    allItems = allItems.concat(res.items);

    console.log(`  📊 Fetched ${allItems.length}/${totalCount} ranked keywords for ${target}`);

    if (res.items.length < limit || allItems.length >= totalCount) break;
    offset += limit;
  }

  return {metrics, items: allItems, totalCount, cost: totalCost};
}

/**
 * Get historical rank overview for a domain — shows ranking trajectory over time.
 * Perfect for: "How have our brand page rankings changed?"
 *
 * Endpoint: POST /dataforseo_labs/google/historical_rank_overview/live
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live/
 *
 * @param {string} target - Domain or URL
 * @param {object} [options]
 * @param {number} [options.locationCode]
 * @param {string} [options.languageCode]
 * @returns {Promise<object>} - { items (monthly snapshots), cost }
 */
async function historicalRankOverview(target, options = {}) {
  const payload = [
    {
      target,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
    },
  ];

  const res = await apiCall('/dataforseo_labs/google/historical_rank_overview/live', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    items: result?.items || [],
    cost: res.cost || 0,
  };
}

// ─── DataForSEO Labs: Keyword Research ────────────────────────────────────────

/**
 * Get keyword ideas relevant to a domain.
 * Perfect for: "What brand keywords should proskatersplace.com target?"
 *
 * Endpoint: POST /dataforseo_labs/google/keywords_for_site/live
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/keywords_for_site/live/
 *
 * @param {string} target - Domain (e.g., 'proskatersplace.com')
 * @param {object} [options]
 * @param {number} [options.locationCode]
 * @param {string} [options.languageCode]
 * @param {number} [options.limit] - Default: 100, max: 1000
 * @param {boolean} [options.includeSerpInfo] - Include SERP data (default: true)
 * @param {Array}  [options.filters]
 * @param {Array}  [options.orderBy]
 * @returns {Promise<object>} - { items, totalCount, cost }
 */
async function keywordsForSite(target, options = {}) {
  const payload = [
    {
      target,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
      limit: options.limit || 100,
      include_serp_info: options.includeSerpInfo !== false,
      include_subdomains: options.includeSubdomains !== false,
      ...(options.filters ? {filters: options.filters} : {}),
      ...(options.orderBy ? {order_by: options.orderBy} : {}),
      ...(options.offset ? {offset: options.offset} : {}),
      ...(options.offsetToken ? {offset_token: options.offsetToken} : {}),
    },
  ];

  const res = await apiCall('/dataforseo_labs/google/keywords_for_site/live', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    items: result?.items || [],
    totalCount: result?.total_count || 0,
    offsetToken: result?.offset_token || null,
    cost: res.cost || 0,
  };
}

/**
 * Get related keywords from Google's "searches related to" element.
 * Perfect for: "What else do people search when looking for 'chaya skates'?"
 *
 * Endpoint: POST /dataforseo_labs/google/related_keywords/live
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live/
 *
 * @param {string} keyword - Seed keyword (e.g., 'chaya skates')
 * @param {object} [options]
 * @param {number} [options.locationCode]
 * @param {string} [options.languageCode]
 * @param {number} [options.depth] - 0-4, more depth = more keywords (default: 2)
 * @param {number} [options.limit] - Default: 100, max: 1000
 * @param {boolean} [options.includeSerpInfo]
 * @param {boolean} [options.includeSeedKeyword] - Include data for the seed keyword (default: true)
 * @returns {Promise<object>} - { seedKeywordData, items, totalCount, cost }
 */
async function relatedKeywords(keyword, options = {}) {
  const payload = [
    {
      keyword,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
      depth: options.depth ?? 2,
      limit: options.limit || 100,
      include_seed_keyword: options.includeSeedKeyword !== false,
      include_serp_info: options.includeSerpInfo !== false,
      ...(options.filters ? {filters: options.filters} : {}),
      ...(options.orderBy ? {order_by: options.orderBy} : {}),
    },
  ];

  const res = await apiCall('/dataforseo_labs/google/related_keywords/live', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    seedKeywordData: result?.seed_keyword_data || null,
    items: result?.items || [],
    totalCount: result?.total_count || 0,
    cost: res.cost || 0,
  };
}

/**
 * Get keyword suggestions that match seed keyword with additional words.
 * Perfect for: "What long-tail keywords exist for 'powerslide skates'?"
 *
 * Endpoint: POST /dataforseo_labs/google/keyword_suggestions/live
 * Docs: https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live/
 *
 * @param {string} keyword - Seed keyword
 * @param {object} [options]
 * @param {number} [options.locationCode]
 * @param {string} [options.languageCode]
 * @param {number} [options.limit]
 * @param {boolean} [options.includeSerpInfo]
 * @param {Array}  [options.filters]
 * @returns {Promise<object>} - { seedKeywordData, items, totalCount, cost }
 */
async function keywordSuggestions(keyword, options = {}) {
  const payload = [
    {
      keyword,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
      limit: options.limit || 100,
      include_seed_keyword: options.includeSeedKeyword !== false,
      include_serp_info: options.includeSerpInfo !== false,
      ...(options.filters ? {filters: options.filters} : {}),
      ...(options.orderBy ? {order_by: options.orderBy} : {}),
    },
  ];

  const res = await apiCall('/dataforseo_labs/google/keyword_suggestions/live', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    seedKeywordData: result?.seed_keyword_data || null,
    items: result?.items || [],
    totalCount: result?.total_count || 0,
    cost: res.cost || 0,
  };
}

// ─── Keywords Data API ────────────────────────────────────────────────────────

/**
 * Get search volume data for a batch of keywords.
 * Perfect for: "What's the exact search volume for these brand keywords?"
 *
 * Endpoint: POST /keywords_data/google_ads/search_volume/live
 * Docs: https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
 *
 * @param {string[]} keywords - Array of keywords (max ~700 per request)
 * @param {object} [options]
 * @param {number} [options.locationCode]
 * @param {string} [options.languageCode]
 * @returns {Promise<object>} - { items, cost }
 */
async function searchVolume(keywords, options = {}) {
  const payload = [
    {
      keywords,
      location_code: options.locationCode || DEFAULT_LOCATION_CODE,
      language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
    },
  ];

  const res = await apiCall('/keywords_data/google_ads/search_volume/live', payload);
  const result = res.tasks?.[0]?.result || [];

  return {
    items: result,
    cost: res.cost || 0,
  };
}

// ─── OnPage API ───────────────────────────────────────────────────────────────

/**
 * Run a single-page instant audit via OnPage Instant Pages endpoint.
 * Returns full on-page SEO data without waiting for a crawl task.
 *
 * Perfect for: "Audit /brand/chaya-skates/ for title, meta, H1, schema, etc."
 *
 * Endpoint: POST /on_page/instant_pages
 * Docs: https://docs.dataforseo.com/v3/on_page/instant_pages/
 *
 * @param {string} url - Full URL to audit (e.g., 'https://proskatersplace.com/brand/chaya-skates/')
 * @param {object} [options]
 * @param {boolean} [options.enableJavascript] - Execute JS on page (default: false)
 * @param {boolean} [options.enableBrowserRendering] - Measure CWV (default: false)
 * @returns {Promise<object>} - { items (page data), cost }
 */
async function onPageInstant(url, options = {}) {
  const payload = [
    {
      url,
      enable_javascript: options.enableJavascript || false,
      enable_browser_rendering: options.enableBrowserRendering || false,
    },
  ];

  const res = await apiCall('/on_page/instant_pages', payload);
  const result = res.tasks?.[0]?.result || [];

  return {
    items: result,
    cost: res.cost || 0,
  };
}

/**
 * Submit a full site crawl task for OnPage analysis.
 * Use for auditing all brand pages at once (crawl /brand/ path only).
 *
 * Endpoint: POST /on_page/task_post
 * Docs: https://docs.dataforseo.com/v3/on_page/task_post/
 *
 * @param {string} target - Domain to crawl (e.g., 'proskatersplace.com')
 * @param {object} [options]
 * @param {number} [options.maxPages] - Max pages to crawl (default: 100)
 * @param {string} [options.startUrl] - Start URL path (default: '/brand/')
 * @param {boolean} [options.enableJavascript]
 * @param {boolean} [options.storeRawHtml] - Store raw HTML for retrieval (default: false)
 * @returns {Promise<object>} - { taskId, cost }
 */
async function onPageTaskPost(target, options = {}) {
  const payload = [
    {
      target,
      max_crawl_pages: options.maxPages || 100,
      start_url: options.startUrl || '/brand/',
      enable_javascript: options.enableJavascript || false,
      store_raw_html: options.storeRawHtml || false,
      load_resources: false,
      calculate_keyword_density: options.calculateKeywordDensity || false,
    },
  ];

  const res = await apiCall('/on_page/task_post', payload);
  const taskId = res.tasks?.[0]?.id;

  return {
    taskId,
    cost: res.cost || 0,
  };
}

/**
 * Get crawl summary for a completed OnPage task.
 *
 * Endpoint: GET /on_page/summary/{id}
 * Docs: https://docs.dataforseo.com/v3/on_page/summary/
 *
 * @param {string} taskId - Task ID from onPageTaskPost
 * @returns {Promise<object>} - { crawlProgress, crawlStatus, domain_info, pages_info, cost }
 */
async function onPageSummary(taskId) {
  // Note: This is a GET-style request but DataForSEO uses POST for consistency
  const res = await apiCall(`/on_page/summary/${taskId}`, []);

  // GET endpoint — parse differently
  const getRes = await fetch(`${API_BASE}/on_page/summary/${taskId}`, {
    method: 'GET',
    headers: {Authorization: AUTH},
  });

  if (!getRes.ok) {
    throw new Error(`DataForSEO OnPage Summary error ${getRes.status}`);
  }

  const json = await getRes.json();
  const result = json.tasks?.[0]?.result?.[0];

  return {
    crawlProgress: result?.crawl_progress || 'unknown',
    crawlStatus: result?.crawl_status || {},
    domainInfo: result?.domain_info || {},
    pagesInfo: result?.pages_info || {},
    cost: json.cost || 0,
  };
}

/**
 * Get crawled pages from a completed OnPage task.
 *
 * Endpoint: POST /on_page/pages
 * Docs: https://docs.dataforseo.com/v3/on_page/pages/
 *
 * @param {string} taskId - Task ID from onPageTaskPost
 * @param {object} [options]
 * @param {number} [options.limit] - Max results (default: 100)
 * @param {number} [options.offset]
 * @param {Array}  [options.filters]
 * @returns {Promise<object>} - { items, totalCount, cost }
 */
async function onPagePages(taskId, options = {}) {
  const payload = [
    {
      id: taskId,
      limit: options.limit || 100,
      ...(options.offset ? {offset: options.offset} : {}),
      ...(options.filters ? {filters: options.filters} : {}),
    },
  ];

  const res = await apiCall('/on_page/pages', payload);
  const result = res.tasks?.[0]?.result?.[0];

  return {
    items: result?.items || [],
    totalCount: result?.total_count || 0,
    cost: res.cost || 0,
  };
}

// ─── Utility: Check account balance ───────────────────────────────────────────

/**
 * Check current DataForSEO account balance and usage.
 *
 * @returns {Promise<object>} - { balance, monthlySpend, ... }
 */
async function checkBalance() {
  const res = await fetch(`${API_BASE}/appendix/user_data`, {
    method: 'GET',
    headers: {Authorization: AUTH},
  });

  if (!res.ok) {
    throw new Error(`DataForSEO user_data error ${res.status}`);
  }

  const json = await res.json();
  const data = json.tasks?.[0]?.result?.[0];

  return {
    login: data?.login || 'unknown',
    balance: data?.money?.balance || 0,
    totalSpent: data?.money?.total_paid || 0,
    limitsPerMinute: data?.limits?.day_tasks_count || 0,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Labs — Competitor Research
  rankedKeywords,
  rankedKeywordsAll,
  historicalRankOverview,

  // Labs — Keyword Research
  keywordsForSite,
  relatedKeywords,
  keywordSuggestions,

  // Keywords Data
  searchVolume,

  // OnPage
  onPageInstant,
  onPageTaskPost,
  onPageSummary,
  onPagePages,

  // Utility
  checkBalance,
  apiCall, // Exposed for advanced/custom endpoint calls

  // Constants
  DEFAULT_LOCATION_CODE,
  CANADA_LOCATION_CODE,
  DEFAULT_LANGUAGE_CODE,
  API_BASE,
};
