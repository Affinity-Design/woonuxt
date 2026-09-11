// server/api/admin/upsell-terms.get.ts — category/brand options for the rule editor pickers.
// Proxies psp/v1/upsell/terms (WordPress get_terms, hidden terms included). Admin-gated.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {getQuery} from 'h3';
import {requireUpsellAdmin, upsellFailure, upsellInvalidInput, wpUpsellRequest} from '../../utils/upsellWpClient';

const ALLOWED = new Set(['product_cat', 'pa_manufacturer', 'pwb-brand']);

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  const query = getQuery(event);
  const taxonomy = String(query.taxonomy || 'product_cat');
  if (!ALLOWED.has(taxonomy)) {
    return upsellInvalidInput('upsell_taxonomy_invalid');
  }
  const search = String(query.search || '').slice(0, 80);
  try {
    return await wpUpsellRequest<{taxonomy: string; terms: unknown[]}>(event, 'terms', {query: {taxonomy, search, per_page: 500}});
  } catch (error) {
    return upsellFailure(error);
  }
});
