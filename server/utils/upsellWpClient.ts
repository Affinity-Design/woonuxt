// server/utils/upsellWpClient.ts
//
// Nitro → WordPress `psp/v1/upsell/*` calls. Same auth + header shape as the contact relay
// (server/utils/emailSender.ts) and create-admin-order, which call WordPress daily without
// tripping the WAF. Upstream error text is never forwarded to browsers — only a stable `code`.

import type {H3Event} from 'h3';
import {createError, getHeader} from 'h3';
import {verifyAdminSession} from './adminAuth';

export const UPSELL_RULES_KV_KEY = 'upsell-rules:ca';
export const UPSELL_RULES_TTL_SECONDS = 300;

export class WpUpsellError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, statusCode: number) {
    super(code);
    this.name = 'WpUpsellError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

interface WpUpsellRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
}

function readConfig(event: H3Event) {
  const config = useRuntimeConfig(event) as Record<string, any>;
  return {
    wpBaseUrl: String(config.public?.wpBaseUrl || process.env.BASE_URL || '').replace(/\/$/, ''),
    username: String(config.wpAdminUsername || process.env.WP_ADMIN_USERNAME || ''),
    password: String(config.wpAdminAppPassword || process.env.WP_ADMIN_APP_PASSWORD || ''),
    revalidationSecret: String(config.REVALIDATION_SECRET || config.revalidationSecret || process.env.REVALIDATION_SECRET || ''),
  };
}

export async function wpUpsellRequest<T = unknown>(event: H3Event, path: string, options: WpUpsellRequestOptions = {}): Promise<T> {
  const {wpBaseUrl, username, password} = readConfig(event);
  if (!wpBaseUrl) throw new WpUpsellError('upsell_wp_unconfigured', 500);

  const url = new URL(`${wpBaseUrl}/wp-json/psp/v1/upsell/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'WooNuxt-Upsell-Admin/1.0',
    Origin: wpBaseUrl,
    Referer: `${wpBaseUrl}/`,
    'X-Requested-With': 'XMLHttpRequest',
  };
  const useAuth = options.auth !== false;
  if (useAuth) {
    if (!username || !password) throw new WpUpsellError('upsell_wp_unconfigured', 500);
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  try {
    return await $fetch<T>(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : (options.body as any),
      timeout: 15000,
    });
  } catch (error: any) {
    const statusCode = Number(error?.status || error?.statusCode || 502);
    const upstreamCode = typeof error?.data?.code === 'string' ? error.data.code : '';
    const code = upstreamCode && /^[a-z0-9_]+$/i.test(upstreamCode) ? upstreamCode : 'upsell_wp_error';
    console.warn('[upsell] WordPress request failed:', statusCode, code, '— sensitive details were withheld.');
    throw new WpUpsellError(code, statusCode >= 400 && statusCode < 600 ? statusCode : 502);
  }
}

export interface UpsellFailure {
  ok: false;
  code: string;
  status: number;
}

/**
 * Failure envelope for admin routes. Thrown errors pass through server/plugins/sanitize-public-errors.ts,
 * which drops `data` (and with it any stable code), so upstream failures are returned as a 200 body
 * carrying only a code — the same `success:false` style the checkout endpoints use. Auth failures still throw.
 */
export function upsellFailure(error: unknown): UpsellFailure {
  if (error instanceof WpUpsellError) {
    return {ok: false, code: error.code, status: error.statusCode};
  }
  const statusCode = Number((error as any)?.statusCode || (error as any)?.status || 500);
  return {ok: false, code: 'upsell_error', status: statusCode >= 400 && statusCode < 600 ? statusCode : 500};
}

export function upsellInvalidInput(code: string): UpsellFailure {
  return {ok: false, code, status: 400};
}

/** Admin gate for every upsell admin route (hiding the tab is cosmetic). */
export async function requireUpsellAdmin(event: H3Event) {
  const verification = await verifyAdminSession(event);
  if (!verification.isAdmin) {
    throw createError({statusCode: 401, statusMessage: 'Admin session required', data: {code: 'unauthorized'}});
  }
  return verification;
}

/** True when the request carries the shared internal secret (server-to-server revalidation). */
export function hasInternalSecret(event: H3Event) {
  const {revalidationSecret} = readConfig(event);
  const provided = getHeader(event, 'x-internal-secret') || '';
  return Boolean(revalidationSecret && provided && provided === revalidationSecret);
}

export async function purgeUpsellRulesCache() {
  try {
    await useStorage('cache').removeItem(UPSELL_RULES_KV_KEY);
  } catch {
    // cache purge is best-effort; the KV entry expires on its own TTL
  }
}
