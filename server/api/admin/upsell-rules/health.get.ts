// server/api/admin/upsell-rules/health.get.ts — plugin health from WordPress. Admin-gated.
// Failures are returned as {ok:false, code} (see upsellFailure) so the UI can map the code to copy.
import {requireUpsellAdmin, upsellFailure, wpUpsellRequest} from '../../../utils/upsellWpClient';

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  await requireUpsellAdmin(event);
  try {
    return await wpUpsellRequest(event, 'health');
  } catch (error) {
    return upsellFailure(error);
  }
});
