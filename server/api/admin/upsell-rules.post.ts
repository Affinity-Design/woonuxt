// server/api/admin/upsell-rules.post.ts — create a rule. Admin-gated; purges the .ca rule cache.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {readBody} from 'h3';
import {purgeUpsellRulesCache, requireUpsellAdmin, upsellFailure, upsellInvalidInput, wpUpsellRequest} from '../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  const body = await readBody(event).catch(() => null);
  const rule = body?.rule;
  if (!rule || typeof rule !== 'object') {
    return upsellInvalidInput('upsell_invalid_body');
  }
  try {
    const result = await wpUpsellRequest(event, 'rules', {method: 'POST', body: rule});
    await purgeUpsellRulesCache();
    return result;
  } catch (error) {
    return upsellFailure(error);
  }
});
