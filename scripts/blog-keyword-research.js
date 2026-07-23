#!/usr/bin/env node
/**
 * Blog rehydration research for proskatersplace.ca
 * Pulls fresh Canadian keyword data via DataForSEO:
 *  1. Current .ca ranked keywords (striking distance + cannibalization guard)
 *  2. Keyword ideas from informational seeds
 * Writes raw results to blog-rehydration-raw.json next to this script.
 *
 * Run from E:/Documents/GitHub/woonuxt (so dotenv finds .env with creds):
 *   node <scratchpad>/blog-rehydration-research.js
 */
const path = require('path');
const fs = require('fs');

const REPO = 'E:/Documents/GitHub/woonuxt';
const dfs = require(path.join(REPO, 'wordpress/scripts/lib/dataforseo.js'));

const CA = 2124;
const OUT = path.join(__dirname, 'blog-rehydration-raw.json');

const SEEDS = [
  'how to roller skate',
  'inline skating',
  'roller skate wheels',
  'skates for kids',
  'roller skates vs rollerblades',
  'skating exercise',
];

(async () => {
  const out = {generatedAt: null, balance: null, ranked: [], seeds: {}, totalCost: 0};

  const bal = await dfs.checkBalance();
  out.balance = bal;
  console.log(`Balance: $${bal.balance} (login ${bal.login})`);

  // 1. Current .ca rankings in Canada — top 1000 by volume
  const ranked = await dfs.rankedKeywords('proskatersplace.ca', {
    locationCode: CA,
    limit: 1000,
    orderBy: ['keyword_data.keyword_info.search_volume,desc'],
  });
  out.ranked = ranked.items.map((i) => ({
    kw: i.keyword_data?.keyword,
    vol: i.keyword_data?.keyword_info?.search_volume,
    kd: i.keyword_data?.keyword_properties?.keyword_difficulty,
    cpc: i.keyword_data?.keyword_info?.cpc,
    intent: i.keyword_data?.search_intent_info?.main_intent,
    pos: i.ranked_serp_element?.serp_item?.rank_absolute,
    url: i.ranked_serp_element?.serp_item?.relative_url,
  }));
  out.totalCost += ranked.cost;
  console.log(`Ranked keywords: ${out.ranked.length}/${ranked.totalCount} ($${ranked.cost})`);

  // 2. Ideas per seed — volume >= 50, sorted by volume
  for (const seed of SEEDS) {
    try {
      const res = await dfs.keywordSuggestions(seed, {
        locationCode: CA,
        limit: 200,
        filters: [['keyword_info.search_volume', '>=', 50]],
        orderBy: ['keyword_info.search_volume,desc'],
      });
      out.seeds[seed] = res.items.map((i) => ({
        kw: i.keyword,
        vol: i.keyword_info?.search_volume,
        kd: i.keyword_properties?.keyword_difficulty,
        cpc: i.keyword_info?.cpc,
        intent: i.search_intent_info?.main_intent,
        trend: i.keyword_info?.monthly_searches?.slice(0, 3)?.map((m) => m.search_volume),
      }));
      out.totalCost += res.cost;
      console.log(`Seed "${seed}": ${out.seeds[seed].length} ideas ($${res.cost})`);
    } catch (e) {
      console.warn(`Seed "${seed}" failed: ${e.message}`);
      out.seeds[seed] = [];
    }
  }

  out.generatedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nTotal API cost: $${out.totalCost.toFixed(3)}`);
  console.log(`Wrote ${OUT}`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
