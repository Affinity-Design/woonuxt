// server/api/admin/upsell-rules.get.ts — list all rules (any status). Admin-gated.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {requireUpsellAdmin, upsellFailure, wpUpsellRequest} from '../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  try {
    return await wpUpsellRequest<{rules: unknown[]}>(event, 'rules');
  } catch (error) {
    return upsellFailure(error);
  }
});
