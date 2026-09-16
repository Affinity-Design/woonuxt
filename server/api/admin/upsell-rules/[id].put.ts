// server/api/admin/upsell-rules/[id].put.ts — replace a rule. Admin-gated; purges the .ca rule cache.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {getRouterParam, readBody} from 'h3';
import {purgeUpsellRulesCache, requireUpsellAdmin, upsellFailure, upsellInvalidInput, wpUpsellRequest} from '../../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    return upsellInvalidInput('upsell_rule_not_found');
  }
  const body = await readBody(event).catch(() => null);
  const rule = body?.rule;
  if (!rule || typeof rule !== 'object') {
    return upsellInvalidInput('upsell_invalid_body');
  }
  try {
    const result = await wpUpsellRequest(event, `rules/${id}`, {method: 'PUT', body: rule});
    await purgeUpsellRulesCache();
    return result;
  } catch (error) {
    return upsellFailure(error);
  }
});
