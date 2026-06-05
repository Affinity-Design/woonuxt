#!/usr/bin/env node
/**
 * One-off slug audit for the mega-menu rebuild.
 *
 * Pulls every WooCommerce product category (incl. empty + children) from the
 * live WPGraphQL endpoint and writes:
 *   data/category-slugs-audit.json   — full list of { slug, name, count, parent }
 *   data/category-slugs-audit.txt    — human-readable tree (parent → children)
 *
 * Use this to cross-check docs/mega-menu-plan.md taxonomy before hardcoding
 * any slug in data/navigation.ts.
 *
 * Usage: node scripts/audit-category-slugs.js
 */

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const GQL_HOST = process.env.GQL_HOST;
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_JSON = path.join(OUT_DIR, 'category-slugs-audit.json');
const OUT_TREE = path.join(OUT_DIR, 'category-slugs-audit.txt');

if (!GQL_HOST) {
  console.error('GQL_HOST is not set in the environment. Aborting.');
  process.exit(1);
}

const QUERY = `
  query AuditCategories($first: Int = 500) {
    productCategories(first: $first, where: { hideEmpty: false }) {
      nodes {
        slug
        name
        count
        databaseId
        parent { node { slug name } }
      }
    }
  }
`;

async function run() {
  console.log(`Querying ${GQL_HOST}…`);
  const res = await fetch(GQL_HOST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { first: 500 } }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }
  const nodes = json.data?.productCategories?.nodes || [];
  console.log(`Got ${nodes.length} categories.`);

  const flat = nodes
    .map((n) => ({
      slug: n.slug,
      name: n.name,
      count: n.count ?? 0,
      parentSlug: n.parent?.node?.slug || null,
      parentName: n.parent?.node?.name || null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(flat, null, 2));
  console.log(`Wrote ${OUT_JSON}`);

  const byParent = new Map();
  for (const c of flat) {
    const key = c.parentSlug || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  const lines = [];
  const walk = (parentKey, depth) => {
    const children = byParent.get(parentKey) || [];
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of children) {
      const pad = '  '.repeat(depth);
      lines.push(`${pad}${c.name}  [${c.slug}]  (${c.count})`);
      walk(c.slug, depth + 1);
    }
  };
  walk('__root__', 0);
  fs.writeFileSync(OUT_TREE, lines.join('\n') + '\n');
  console.log(`Wrote ${OUT_TREE}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
