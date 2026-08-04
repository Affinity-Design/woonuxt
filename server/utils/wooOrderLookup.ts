// server/utils/wooOrderLookup.ts
//
// Authoritative "does an order already exist for this purchase?" lookup against WooCommerce
// itself — the second storage-independent guard layer (Helcim answers for charges,
// WooCommerce answers for orders).
//
// WC REST cannot query custom meta directly, but it CAN search orders by billing email; we then
// match the checkout attempt id / Helcim transaction id in each candidate's fields & meta.
// create-admin-order stamps `_checkout_attempt_id` on every order it creates, so a retry of the
// same attempt is findable here even when every KV/D1 record is gone.
//
// Throws on transport/auth failure so callers can distinguish "verified absent" (null) from
// "could not verify" (throw) — the latter must NEVER silently proceed to create a duplicate.

export interface WooOrderRef {
  id: number;
  databaseId: number;
  orderNumber: string;
  orderKey?: string;
  status?: string;
  total?: string;
  transactionId?: string;
  checkoutAttemptId?: string;
}

interface WooRestOrderRaw {
  id: number;
  number?: number | string;
  order_key?: string;
  status?: string;
  total?: string;
  transaction_id?: string;
  meta_data?: Array<{key: string; value: any}>;
}

function metaValue(order: WooRestOrderRaw, keys: string[]): string | undefined {
  const hit = Array.isArray(order.meta_data) ? order.meta_data.find((m) => keys.includes(m.key)) : undefined;
  return hit != null ? String(hit.value) : undefined;
}

function normalize(order: WooRestOrderRaw): WooOrderRef {
  return {
    id: order.id,
    databaseId: order.id,
    orderNumber: order.number != null ? String(order.number) : String(order.id),
    orderKey: order.order_key,
    status: order.status,
    total: order.total,
    transactionId: String(order.transaction_id || metaValue(order, ['_transaction_id', '_helcim_transaction_id']) || '') || undefined,
    checkoutAttemptId: metaValue(order, ['_checkout_attempt_id']),
  };
}

/**
 * Find an existing WooCommerce order for a checkout attempt and/or Helcim transaction.
 * Searches recent orders for the billing email (plus a direct transaction-id search as a
 * fallback) and matches exactly on stamped meta. Returns null when verified absent.
 */
export async function findWooOrderForAttempt(params: {
  wpBaseUrl: string;
  authHeader: string; // value for the Authorization header, e.g. `Basic <b64>`
  email?: string | null;
  checkoutAttemptId?: string | null;
  transactionId?: string | null;
}): Promise<WooOrderRef | null> {
  const {wpBaseUrl, authHeader, email, checkoutAttemptId, transactionId} = params;
  if (!wpBaseUrl || !authHeader) throw new Error('WooCommerce credentials are not configured');
  if (!checkoutAttemptId && !transactionId) return null;

  const fetchOrders = async (queryString: string): Promise<WooRestOrderRaw[]> => {
    const res = await fetch(`${wpBaseUrl}/wp-json/wc/v3/orders?${queryString}`, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'WooNuxt-Order-Lookup/1.0',
      },
    });
    if (!res.ok) throw new Error(`WC order search failed: ${res.status} ${res.statusText}`);
    const orders = (await res.json()) as WooRestOrderRaw[];
    return Array.isArray(orders) ? orders : [];
  };

  const candidates: WooRestOrderRaw[] = [];
  if (email && String(email).trim()) {
    candidates.push(...(await fetchOrders(`search=${encodeURIComponent(String(email).trim())}&per_page=30&orderby=date&order=desc`)));
  }
  if (transactionId) {
    // WC search indexes billing fields, not meta — this fallback catches installs where the
    // transaction id landed in an indexed field. Best-effort; errors here still throw.
    candidates.push(...(await fetchOrders(`search=${encodeURIComponent(String(transactionId))}&per_page=20`)));
  }

  const matches = (order: WooRestOrderRaw): boolean => {
    if (checkoutAttemptId && metaValue(order, ['_checkout_attempt_id']) === String(checkoutAttemptId)) return true;
    if (transactionId) {
      if (String(order.transaction_id || '') === String(transactionId)) return true;
      if (metaValue(order, ['_transaction_id', '_helcim_transaction_id']) === String(transactionId)) return true;
    }
    return false;
  };

  const match = candidates.find(matches);
  return match ? normalize(match) : null;
}
