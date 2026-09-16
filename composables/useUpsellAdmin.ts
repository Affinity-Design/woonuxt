// composables/useUpsellAdmin.ts
//
// Admin-side helpers for the Upsell Rules tab (my-account → Admin). Thin client over
// /api/admin/upsell-* which proxies the WordPress plugin with the admin app password after
// verifying the caller's WP role. Errors arrive as stable codes and are mapped to copy here —
// upstream error text is never shown.

import type {UpsellNoticeKey, UpsellRuleDocument, UpsellTaxonomy, UpsellTermOption} from '#shared/types/upsell';

export const UPSELL_TAXONOMIES: Array<{value: UpsellTaxonomy; label: string; hierarchical: boolean}> = [
  {value: 'product_cat', label: 'Category', hierarchical: true},
  {value: 'pa_manufacturer', label: 'Brand', hierarchical: false},
];

export const UPSELL_NOTICE_FIELDS: Array<{key: UpsellNoticeKey; label: string; hint: string}> = [
  {key: 'product_trigger', label: 'Product page — trigger product', hint: 'Shown on products that unlock the discount.'},
  {key: 'product_target', label: 'Product page — target product', hint: 'Shown on products that get discounted.'},
  {key: 'cart_pending', label: 'Cart — trigger in cart, target missing', hint: 'Includes a button to the target listing.'},
  {key: 'cart_applied', label: 'Cart — discount applied', hint: 'Confirmation once the coupon is in the cart.'},
  {key: 'checkout', label: 'Checkout — line breakdown', hint: 'Label on each discounted line at checkout.'},
  {key: 'coupon_label', label: 'Coupon label (.com totals)', hint: 'Replaces the raw UPSELL-XXXXXX code in cart/checkout totals on proskatersplace.com.'},
];

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Your login is not recognised as an admin. Sign in with an administrator or shop manager account.',
  upsell_invalid_body: 'The rule could not be sent. Reload the page and try again.',
  upsell_name_empty: 'Give the rule a name.',
  upsell_status_invalid: 'Status must be Active or Paused.',
  upsell_channels_empty: 'Choose at least one store.',
  upsell_trigger_empty: 'Pick at least one trigger category or brand.',
  upsell_target_empty: 'Pick at least one target category or brand.',
  upsell_target_match_invalid: 'Target match must be "all" or "any".',
  upsell_discount_type: 'Only percent discounts are supported right now.',
  upsell_discount_range: 'Discount must be between 1% and 100%.',
  upsell_schedule_format: 'Dates must be YYYY-MM-DD.',
  upsell_schedule_order: 'The start date must be on or before the end date.',
  upsell_taxonomy_invalid: 'One of the selectors uses an unsupported taxonomy.',
  upsell_term_not_found: 'One of the selected categories/brands no longer exists — remove and re-select it.',
  upsell_selectors_invalid: 'Selectors are malformed. Reload and try again.',
  upsell_cta_invalid: 'Link overrides must be site-relative paths starting with "/".',
  upsell_rule_not_found: 'That rule no longer exists. Reload the list.',
  upsell_wp_unconfigured: 'The WordPress connection is not configured on this server.',
  upsell_wp_auth_failed:
    "WordPress rejected this site's admin connection (WP_ADMIN_USERNAME / WP_ADMIN_APP_PASSWORD). Your own login is fine — the app password in this deployment's environment needs updating.",
  upsell_wp_error: 'WordPress rejected the request.',
};

/** Admin routes return failures as a 200 `{ok:false, code, status}` envelope (thrown errors lose their code in the public error sanitizer). */
class UpsellRequestFailure extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'UpsellRequestFailure';
    this.code = code;
    this.status = status;
  }
}

function unwrap<T>(result: any): T {
  if (result && typeof result === 'object' && result.ok === false) {
    throw new UpsellRequestFailure(String(result.code || 'upsell_error'), Number(result.status || 500));
  }
  return result as T;
}

export function describeUpsellError(error: any): string {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || error?.data?.data?.code || error?.data?.code || '');
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 401) return ERROR_MESSAGES.unauthorized;
  if (status === 404) return 'The upsell plugin does not seem to be installed on the WordPress backend yet.';
  return 'The request failed. Please try again.';
}

export function createDefaultUpsellRule(): UpsellRuleDocument {
  return {
    schema_version: 1,
    name: '',
    status: 'paused',
    channels: ['ca', 'com'],
    priority: 10,
    trigger: {selectors: [{taxonomy: 'product_cat', term_ids: [], include_children: true}], trigger_label: '', min_qty: 1},
    target: {
      selectors: [{taxonomy: 'product_cat', term_ids: [], include_children: true}],
      match: 'all',
      target_label: '',
      exclude_trigger_items: true,
      exclude_sale_items: false,
      max_qty_per_order: null,
    },
    discount: {type: 'percent', amount: 20},
    schedule: {starts_at: null, ends_at: null, timezone: 'America/Toronto'},
    notices: {
      en: {
        product_trigger: 'Pair this with any {target} and get {discount} off',
        product_target: 'Add any {trigger} to get {discount} off these',
        cart_pending: 'You added {trigger}! Add {target} to your cart to save {discount}.',
        cart_applied: '{discount} off {target} applied.',
        checkout: 'Bundle savings: {discount} off {target}',
        coupon_label: 'Bundle savings: {discount} off {target}',
      },
      fr: {},
    },
    cta: {ca_path: null, com_path: null},
    coupon: {ttl_hours: 48, code_prefix: 'UPSELL'},
  };
}

export function formatPercent(amount: number | string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `${String(Math.round(n * 100) / 100)}%`;
}

export function useUpsellAdmin() {
  const termsByTaxonomy = useState<Record<string, UpsellTermOption[]>>('upsell-admin-terms', () => ({}));
  const termsLoading = useState<Record<string, boolean>>('upsell-admin-terms-loading', () => ({}));

  const loadTerms = async (taxonomy: UpsellTaxonomy, force = false): Promise<UpsellTermOption[]> => {
    if (!force && termsByTaxonomy.value[taxonomy]) return termsByTaxonomy.value[taxonomy];
    if (termsLoading.value[taxonomy]) return termsByTaxonomy.value[taxonomy] || [];
    termsLoading.value = {...termsLoading.value, [taxonomy]: true};
    try {
      const result = unwrap<{terms: UpsellTermOption[]}>(await $fetch('/api/admin/upsell-terms', {query: {taxonomy}}));
      const terms = Array.isArray(result?.terms) ? result.terms : [];
      termsByTaxonomy.value = {...termsByTaxonomy.value, [taxonomy]: terms};
      return terms;
    } finally {
      termsLoading.value = {...termsLoading.value, [taxonomy]: false};
    }
  };

  const termById = (taxonomy: string, id: number): UpsellTermOption | undefined => (termsByTaxonomy.value[taxonomy] || []).find((term) => term.id === id);

  /** "Parent › Child" for hierarchical taxonomies, plain name otherwise. */
  const termPath = (taxonomy: string, id: number): string => {
    const list = termsByTaxonomy.value[taxonomy] || [];
    const byId = new Map(list.map((term) => [term.id, term]));
    const parts: string[] = [];
    let current = byId.get(id);
    let guard = 0;
    while (current && guard < 5) {
      parts.unshift(current.name);
      current = current.parent ? byId.get(current.parent) : undefined;
      guard++;
    }
    return parts.length ? parts.join(' › ') : `#${id}`;
  };

  const listRules = async (): Promise<UpsellRuleDocument[]> => {
    const result = unwrap<{rules: UpsellRuleDocument[]}>(await $fetch('/api/admin/upsell-rules'));
    return Array.isArray(result?.rules) ? result.rules : [];
  };

  const saveRule = async (rule: UpsellRuleDocument): Promise<{rule: UpsellRuleDocument; warnings: string[]}> => {
    const payload: UpsellRuleDocument = {...rule};
    delete payload.id;
    delete payload.created;
    delete payload.modified;
    delete payload.author;
    if (rule.id) {
      return unwrap(await $fetch(`/api/admin/upsell-rules/${rule.id}`, {method: 'PUT', body: {rule: payload}}));
    }
    return unwrap(await $fetch('/api/admin/upsell-rules', {method: 'POST', body: {rule: payload}}));
  };

  const setRuleStatus = async (id: number, status: 'active' | 'paused'): Promise<UpsellRuleDocument> => {
    const result = unwrap<{rule: UpsellRuleDocument}>(await $fetch(`/api/admin/upsell-rules/${id}`, {method: 'PATCH', body: {status}}));
    return result.rule;
  };

  const deleteRule = async (id: number): Promise<void> => {
    unwrap(await $fetch(`/api/admin/upsell-rules/${id}`, {method: 'DELETE'}));
  };

  const loadHealth = async (): Promise<Record<string, any>> => unwrap(await $fetch('/api/admin/upsell-rules/health'));

  return {termsByTaxonomy, termsLoading, loadTerms, termById, termPath, listRules, saveRule, setRuleStatus, deleteRule, loadHealth};
}
