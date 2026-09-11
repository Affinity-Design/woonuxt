// server/api/upsell/rules.get.ts
//
// Public, cached list of active upsell rules for the .ca channel. Product pages evaluate
// banners client-side from this list + the cached product's terms, so rule changes never
// require purging the 24h product cache. Fails soft: any error → [] (no upsell UI).

import {normalizeWpRule} from '#shared/utils/upsellMatcher.mjs';
import {UPSELL_RULES_KV_KEY, UPSELL_RULES_TTL_SECONDS, wpUpsellRequest} from '../../utils/upsellWpClient';

interface CachedRules {
  fetchedAt: number;
  rules: unknown[];
}

export default defineEventHandler(async (event) => {
  const storage = useStorage('cache');

  try {
    const cached = await storage.getItem<CachedRules>(UPSELL_RULES_KV_KEY);
    if (cached && Array.isArray(cached.rules) && Date.now() - Number(cached.fetchedAt || 0) < UPSELL_RULES_TTL_SECONDS * 1000) {
      setHeader(event, 'Cache-Control', 'public, max-age=60');
      return cached.rules;
    }
  } catch {
    // cache read failure → fall through to origin
  }

  try {
    const data = await wpUpsellRequest<{version?: string; rules?: unknown[]}>(event, 'rules/active', {query: {channel: 'ca'}, auth: false});
    const rules = (Array.isArray(data?.rules) ? data.rules : []).map(normalizeWpRule).filter(Boolean);
    try {
      await storage.setItem(UPSELL_RULES_KV_KEY, {fetchedAt: Date.now(), rules} as CachedRules, {ttl: UPSELL_RULES_TTL_SECONDS});
    } catch {
      // best-effort cache write
    }
    setHeader(event, 'Cache-Control', 'public, max-age=60');
    return rules;
  } catch {
    console.warn('[upsell] rules fetch failed; serving no rules. Sensitive details were withheld.');
    setHeader(event, 'Cache-Control', 'no-store');
    return [];
  }
});
