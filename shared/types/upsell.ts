// Shared (app + server) types for the conditional upsell coupons feature.
// Spec: specs/002-conditional-upsell-coupons/data-model.md

export type UpsellChannel = 'ca' | 'com';
export type UpsellTaxonomy = 'product_cat' | 'pa_manufacturer' | 'pwb-brand';
export type UpsellNoticeKey = 'product_trigger' | 'product_target' | 'cart_pending' | 'cart_applied' | 'checkout' | 'coupon_label';
export type UpsellLocale = 'en' | 'fr';

export interface UpsellTerm {
  id: number;
  slug: string;
  name: string;
}

export interface UpsellSelector {
  taxonomy: UpsellTaxonomy | string;
  termIds: number[];
  terms: UpsellTerm[];
}

/** Compiled, storefront-safe rule (what /api/upsell/rules returns). */
export interface UpsellRulePublic {
  id: number;
  name: string;
  priority: number;
  hash: string;
  channels: UpsellChannel[];
  trigger: {selectors: UpsellSelector[]; label: string; minQty: number};
  target: {selectors: UpsellSelector[]; match: 'all' | 'any'; label: string; excludeTriggerItems: boolean};
  discount: {type: 'percent'; amount: number; display: string};
  schedule: {startsAt: string | null; endsAt: string | null};
  notices: Partial<Record<UpsellLocale, Partial<Record<UpsellNoticeKey, string>>>>;
  cta: {triggerSide: string; targetSide: string};
}

export interface ProductUpsellMatch {
  rule: UpsellRulePublic;
  side: 'trigger' | 'target';
  text: string;
  ctaPath: string;
  ctaLabel: string;
}

export interface UpsellCartNotice {
  ruleId: number;
  kind: 'pending' | 'applied';
  text: string;
  ctaPath: string | null;
}

export interface UpsellLineItemDiscount {
  cartItemKey: string;
  ruleId: number;
  couponCode: string;
  amount: string;
  label: string;
}

export interface CartUpsellState {
  channel: UpsellChannel;
  rulesVersion: string;
  eligibleOffers: Array<{ruleId: number; state: 'inactive' | 'pending' | 'applied' | 'dismissed'; label: string; couponCode: string | null; discount: string | null}>;
  appliedAutoCoupons: string[];
  cartNotices: UpsellCartNotice[];
  missingQualifiers: Array<{ruleId: number; label: string; ctaPath: string}>;
  lineItemDiscounts: UpsellLineItemDiscount[];
  validatedCoupons: string[];
}

/** Full rule document as stored on WordPress (admin editing). */
export interface UpsellSelectorInput {
  taxonomy: UpsellTaxonomy;
  term_ids: number[];
  include_children: boolean;
}

export interface UpsellRuleDocument {
  id?: number;
  schema_version: 1;
  name: string;
  status: 'active' | 'paused';
  channels: UpsellChannel[];
  priority: number;
  trigger: {selectors: UpsellSelectorInput[]; trigger_label: string; min_qty: number};
  target: {
    selectors: UpsellSelectorInput[];
    match: 'all' | 'any';
    target_label: string;
    exclude_trigger_items: boolean;
    exclude_sale_items: boolean;
    max_qty_per_order: number | null;
  };
  discount: {type: 'percent'; amount: number};
  schedule: {starts_at: string | null; ends_at: string | null; timezone: string};
  notices: {en: Record<UpsellNoticeKey, string>; fr: Partial<Record<UpsellNoticeKey, string>>};
  cta: {ca_path: string | null; com_path: string | null};
  coupon: {ttl_hours: number; code_prefix: string};
  created?: string;
  modified?: string;
  author?: number;
}

export interface UpsellTermOption {
  id: number;
  slug: string;
  name: string;
  parent: number;
  count: number;
}
