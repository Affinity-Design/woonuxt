// server/api/admin/upsell-rules/[id].delete.ts — trash a rule. Admin-gated; purges the .ca rule cache.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {getRouterParam} from 'h3';
import {purgeUpsellRulesCache, requireUpsellAdmin, upsellFailure, upsellInvalidInput, wpUpsellRequest} from '../../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id <= 0) {
    return upsellInvalidInput('upsell_rule_not_found');
  }
  try {
    const result = await wpUpsellRequest(event, `rules/${id}`, {method: 'DELETE'});
    await purgeUpsellRulesCache();
    return result;
  } catch (error) {
    return upsellFailure(error);
  }
});
