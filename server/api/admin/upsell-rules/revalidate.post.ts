// server/api/admin/upsell-rules/revalidate.post.ts — purge the cached .ca rule list.
// Dual gate (like checkout-failures.get.ts): the shared internal secret OR an admin session.
import {hasInternalSecret, purgeUpsellRulesCache, requireUpsellAdmin} from '../../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  if (!hasInternalSecret(event)) {
    await requireUpsellAdmin(event);
  }
  await purgeUpsellRulesCache();
  return {purged: true};
});
