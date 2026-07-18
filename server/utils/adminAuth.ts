// server/utils/adminAuth.ts
//
// Server-side WP-role verification for admin-only frontend features (the my-account Admin tabs,
// admin actions on /api/recover-helcim-order, and future admin endpoints).
//
// HOW IT WORKS
// ------------
// The frontend keeps the WooCommerce session token in a first-party `woocommerce-session` cookie
// (woonuxt_base/app/plugins/init.ts), so every same-origin /api call carries it automatically.
// We forward that token to WPGraphQL and ask WordPress who it belongs to (`viewer`). The token is
// validated entirely by WordPress — a client can present a token, but cannot forge the identity or
// roles WordPress resolves from it. Client-side checks (which tabs to show) are cosmetic; THIS is
// the enforcement point, so every admin endpoint must call verifyAdminSession itself.
//
// Roles come from viewer.roles when WPGraphQL exposes them; otherwise a REST fallback resolves
// them with the admin app password, keyed strictly on the databaseId WordPress itself resolved
// from the session token — never on anything client-supplied.
// Fail-closed: missing token, timeout, or any error → not admin.

import type {H3Event} from 'h3';
import {getCookie, getHeader} from 'h3';

const ADMIN_ROLES = ['administrator', 'shop_manager'];

export interface AdminVerification {
  isAdmin: boolean;
  userId: number | null;
  username: string | null;
  roles: string[];
}

const notAdmin = (): AdminVerification => ({isAdmin: false, userId: null, username: null, roles: []});

export async function verifyAdminSession(event: H3Event): Promise<AdminVerification> {
  try {
    const config = useRuntimeConfig();
    const wpBaseUrl = config.public?.wpBaseUrl;
    if (!wpBaseUrl) return notAdmin();

    // Cookie on normal browser calls; a raw "Session <token>" header is accepted for tooling.
    const headerToken = getHeader(event, 'woocommerce-session');
    const cookieToken = getCookie(event, 'woocommerce-session');
    const sessionHeader = headerToken || (cookieToken ? `Session ${cookieToken}` : '');

    // The JWT the client authenticates `viewer` with. nuxt-graphql-client's default tokenStorage
    // is cookie-mode under `gql:default` (set by useGqlToken at login), so same-origin /api calls
    // carry it. The woocommerce-session token alone does NOT resolve `viewer` — verified
    // 2026-07-17: a logged-in administrator got {viewer:null} until the Bearer token was forwarded.
    const authTokenCookie = getCookie(event, 'gql:default');
    if (!sessionHeader && !authTokenCookie) return notAdmin();

    const siteUrl = (config.public as any)?.siteUrl || 'https://proskatersplace.ca';
    const queryViewer = async (withBearer: boolean): Promise<any | null> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(`${wpBaseUrl}/graphql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Browser-like headers (stock-status / serverGetProduct pattern): the WordPress-side
            // security blocks Worker requests with bot-style User-Agents, and a blocked viewer
            // lookup silently fails closed — admins never see their tabs.
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json',
            Origin: siteUrl,
            Referer: siteUrl,
            ...(sessionHeader ? {'woocommerce-session': sessionHeader} : {}),
            ...(withBearer && authTokenCookie ? {Authorization: `Bearer ${authTokenCookie}`} : {}),
          },
          body: JSON.stringify({query: 'query VerifyAdminViewer { viewer { databaseId username roles { nodes { name } } } }'}),
          signal: controller.signal,
        });
        if (!response.ok) {
          console.warn('[Admin Verify] viewer request rejected:', response.status, response.statusText, withBearer ? '(with bearer)' : '(session only)');
          return null;
        }
        const result: any = await response.json().catch(() => null);
        return result?.data?.viewer || null;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Mirror the client's working request first (Bearer + session). Retry session-only when the
    // JWT is expired/invalid, so a stale token can't lock out an otherwise-valid session.
    let viewer = await queryViewer(true);
    if (!viewer?.databaseId && authTokenCookie && sessionHeader) {
      viewer = await queryViewer(false);
    }
    if (!viewer?.databaseId) return notAdmin();

    let roles: string[] = (viewer.roles?.nodes || []).map((node: any) => node?.name).filter(Boolean);

    // Some WPGraphQL setups hide `roles` even on the user's own viewer object — resolve them via
    // REST with admin credentials, using only the id WordPress resolved from the session token.
    if (!roles.length && config.wpAdminUsername && config.wpAdminAppPassword) {
      const auth = Buffer.from(`${config.wpAdminUsername}:${config.wpAdminAppPassword}`).toString('base64');
      const userRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/users/${viewer.databaseId}?context=edit`, {
        headers: {
          Authorization: `Basic ${auth}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });
      if (userRes.ok) {
        const user: any = await userRes.json().catch(() => null);
        if (Array.isArray(user?.roles)) roles = user.roles;
      }
    }

    return {
      isAdmin: roles.some((role) => ADMIN_ROLES.includes(role)),
      userId: viewer.databaseId,
      username: viewer.username || null,
      roles,
    };
  } catch (error: any) {
    console.warn('[Admin Verify] Verification failed (treating as not admin):', error?.message || error);
    return notAdmin();
  }
}
