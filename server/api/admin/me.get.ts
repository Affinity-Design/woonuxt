// server/api/admin/me.get.ts
//
// Admin-status for the logged-in customer — drives which Admin tabs the my-account UI offers.
// Identity and roles are resolved by WordPress from the woocommerce-session cookie
// (server/utils/adminAuth.ts). Showing/hiding UI is cosmetic; every admin endpoint re-verifies.
// Per-user response: never cache.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store');
  const verification = await verifyAdminSession(event);
  return {
    isAdmin: verification.isAdmin,
    username: verification.username,
    roles: verification.roles,
  };
});
