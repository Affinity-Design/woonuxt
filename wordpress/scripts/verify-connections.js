#!/usr/bin/env node
/**
 * verify-connections.js
 * Tests all three WordPress API connections using credentials from .env
 * Run: node wordpress/scripts/verify-connections.js
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL;
const GQL_HOST = process.env.GQL_HOST;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;
const WP_USER = process.env.WP_ADMIN_USERNAME;
const WP_PASS = process.env.WP_ADMIN_APP_PASSWORD;

const PASS_B64 = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

// ─── helpers ──────────────────────────────────────────────────────────────────

function ok(label) {
  console.log(`  ✅  ${label}`);
}
function fail(label) {
  console.log(`  ❌  ${label}`);
}
function info(label) {
  console.log(`  ℹ️   ${label}`);
}
function hr() {
  console.log('─'.repeat(60));
}

async function check(label, fn) {
  try {
    await fn();
    ok(label);
    return true;
  } catch (err) {
    fail(`${label}\n       ${err.message}`);
    return false;
  }
}

// ─── pre-flight ───────────────────────────────────────────────────────────────

console.log('\n🔍  WordPress Connection Verifier');
hr();
info(`Target: ${BASE_URL ?? '(not set)'}`);
info(`GraphQL: ${GQL_HOST ?? '(not set)'}`);
hr();

const missing = [];
if (!BASE_URL) missing.push('BASE_URL');
if (!GQL_HOST) missing.push('GQL_HOST');
if (!WC_KEY) missing.push('WC_CONSUMER_KEY');
if (!WC_SECRET) missing.push('WC_CONSUMER_SECRET');
if (!WP_USER) missing.push('WP_ADMIN_USERNAME');
if (!WP_PASS) missing.push('WP_ADMIN_APP_PASSWORD');

if (missing.length) {
  missing.forEach((v) => fail(`Missing env var: ${v}`));
  console.log('\n⚠️  Fix the missing variables above and re-run.\n');
  process.exit(1);
}

// ─── tests ────────────────────────────────────────────────────────────────────

async function testWpRest() {
  // GET /wp-json/ — basic reachability, no auth needed
  const res = await fetch(`${BASE_URL}/wp-json/`, {method: 'GET'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.name) throw new Error('Unexpected response shape');
  info(`  Site name: "${json.name}"`);
}

async function testWpAuth() {
  // GET /wp-json/wp/v2/users/me — requires valid Application Password
  const res = await fetch(`${BASE_URL}/wp-json/wp/v2/users/me`, {
    headers: {Authorization: `Basic ${PASS_B64}`},
  });
  if (res.status === 401) throw new Error('401 Unauthorized — check WP_ADMIN_USERNAME and WP_ADMIN_APP_PASSWORD');
  if (res.status === 403) throw new Error('403 Forbidden — user may lack REST API access');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  info(`  Logged in as: "${json.name}" (id: ${json.id}, roles: ${json.roles?.join(', ') ?? 'unknown'})`);
}

async function testWcRest() {
  // GET /wp-json/wc/v3/system_status — lightest authenticated WC endpoint
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/wp-json/wc/v3/system_status`, {
    headers: {Authorization: `Basic ${auth}`},
  });
  if (res.status === 401) throw new Error('401 Unauthorized — check WC_CONSUMER_KEY and WC_CONSUMER_SECRET');
  if (res.status === 403) throw new Error('403 Forbidden — consumer key may not have read permissions');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  info(`  WooCommerce: v${json.environment?.version ?? '?'}, currency: ${json.settings?.currency ?? '?'}`);
}

async function testGraphQL() {
  // Simple introspection query — minimal, just proves the endpoint is live
  const res = await fetch(GQL_HOST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${PASS_B64}`,
    },
    body: JSON.stringify({query: '{ generalSettings { title url } }'}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  const title = json.data?.generalSettings?.title;
  info(`  Site title from GraphQL: "${title}"`);
}

// ─── run ──────────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;

  console.log('\n1. WordPress REST API — reachability');
  if (await check('Site responds at /wp-json/', testWpRest)) passed++;

  console.log('\n2. WordPress REST API — Application Password auth');
  if (await check('WP_ADMIN_USERNAME + WP_ADMIN_APP_PASSWORD valid', testWpAuth)) passed++;

  console.log('\n3. WooCommerce REST API — consumer key auth');
  if (await check('WC_CONSUMER_KEY + WC_CONSUMER_SECRET valid', testWcRest)) passed++;

  console.log('\n4. WPGraphQL — admin-authenticated query');
  if (await check('GraphQL endpoint returns data', testGraphQL)) passed++;

  hr();
  if (passed === 4) {
    console.log(`✅  All 4 connections verified — ready to run scripts against ${BASE_URL}\n`);
  } else {
    console.log(`⚠️  ${passed}/4 checks passed — fix the failures above before running other scripts\n`);
    process.exit(1);
  }
})();
