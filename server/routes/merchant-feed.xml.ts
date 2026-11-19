/**
 * Google Merchant Center product feed for proskatersplace.ca.
 *
 * Public URL:  https://proskatersplace.ca/merchant-feed.xml
 * Point Merchant Center (Products → Feeds → Canada) at that URL and set a daily
 * scheduled fetch. It replaces the Rex Feed export from the .com backend, whose
 * <g:link> values all pointed at proskatersplace.com — sending Canadian Shopping
 * clicks to the US store.
 *
 * Data comes from data/merchant-feed-ca.json, produced by
 * scripts/build-merchant-feed.js (KV first, bundled file as fallback — same
 * pattern as server/api/sitemap.xml.ts). Rendering XML here rather than storing
 * it keeps the payload small and the Worker fast.
 */

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link?: string[];
  availability: string;
  price: string;
  sale_price?: string;
  brand: string;
  mpn?: string;
  identifier_exists?: string;
  condition: string;
  product_type?: string;
  shipping_weight?: string;
}

interface FeedData {
  generatedAt: string;
  itemCount: number;
  items: FeedItem[];
}

/** XML text escaping for attribute-free element content. */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Strip control characters — a single stray byte invalidates the whole feed.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const tag = (name: string, value?: unknown): string => (value === undefined || value === null || value === '' ? '' : `<g:${name}>${esc(value)}</g:${name}>`);

function renderItem(item: FeedItem): string {
  const additional = (item.additional_image_link || []).map((url) => tag('additional_image_link', url)).join('');

  return [
    '<item>',
    tag('id', item.id),
    tag('title', item.title),
    tag('description', item.description),
    tag('link', item.link),
    tag('image_link', item.image_link),
    additional,
    tag('availability', item.availability),
    tag('price', item.price),
    tag('sale_price', item.sale_price),
    tag('brand', item.brand),
    tag('mpn', item.mpn),
    tag('identifier_exists', item.identifier_exists),
    tag('condition', item.condition),
    tag('product_type', item.product_type),
    tag('shipping_weight', item.shipping_weight),
    // Free shipping over $135 CAD is the store-wide offer; Merchant Center
    // requires a shipping block or account-level shipping settings.
    '<g:shipping><g:country>CA</g:country><g:service>Standard</g:service></g:shipping>',
    '</item>',
  ].join('');
}

export default defineEventHandler(async (event) => {
  let feed: FeedData | null = null;

  // PRODUCTION: Cloudflare KV (NUXT_SCRIPT_DATA)
  try {
    const storage = useStorage('script_data');
    feed = (await storage.getItem('merchant-feed-ca')) as FeedData | null;
    if (feed) console.log('[merchant-feed] serving from KV');
  } catch (kvError) {
    console.warn('[merchant-feed] KV read failed, falling back to file:', kvError);
  }

  // FALLBACK: bundled build output
  if (!feed) {
    try {
      const {readFileSync} = await import('fs');
      const {resolve} = await import('path');
      feed = JSON.parse(readFileSync(resolve(process.cwd(), 'data', 'merchant-feed-ca.json'), 'utf8'));
      console.log('[merchant-feed] serving from local file');
    } catch {
      feed = null;
    }
  }

  if (!feed?.items?.length) {
    // Never serve an empty feed: Merchant Center treats a successful fetch with
    // zero items as "all products removed" and delists the account's catalogue.
    //
    // In production this means KV has no `merchant-feed-ca` key — the file
    // fallback above cannot fire in a Cloudflare Worker (no fs / process.cwd).
    // Populate it by running the build with CF_ACCOUNT_ID, CF_API_TOKEN and
    // CF_KV_NAMESPACE_ID_SCRIPT_DATA set, which scripts/build-merchant-feed.js
    // does automatically as part of `npm run build`.
    console.error('[merchant-feed] no feed data — KV key `merchant-feed-ca` is empty and the fs fallback is unavailable on Workers');
    throw createError({
      statusCode: 503,
      statusMessage: 'Merchant feed not generated yet — KV key merchant-feed-ca is empty',
    });
  }

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=21600');
  setResponseHeader(event, 'X-Robots-Tag', 'noindex');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    '<channel>',
    '<title>ProSkaters Place Canada</title>',
    `<link>https://proskatersplace.ca</link>`,
    '<description>Inline skates, roller skates and protective gear shipped across Canada.</description>',
    `<lastBuildDate>${esc(feed.generatedAt)}</lastBuildDate>`,
    ...feed.items.map(renderItem),
    '</channel>',
    '</rss>',
  ].join('');
});
