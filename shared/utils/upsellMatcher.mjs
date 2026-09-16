// Pure rule matching for the .ca product page (client-side evaluation over the cached
// product's terms) — mirrors PSP_Upsell_Engine::product_matches_selector() in the
// WordPress plugin. Keep both in step; tests/upsellMatcher.test.mjs pins the behaviour.

const NOTICE_DEFAULTS = {
  product_trigger: 'Pair this with any {target} and get {discount} off',
  product_target: 'Add any {trigger} to get {discount} off these',
  cart_pending: 'You added {trigger}! Add {target} to your cart to save {discount}.',
  cart_applied: '{discount} off {target} applied.',
  checkout: 'Bundle savings: {discount} off {target}',
  coupon_label: 'Bundle savings: {discount} off {target}',
};

const toInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/** YYYY-MM-DD in America/Toronto — the schedule timezone used by the rules. */
export function torontoToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function normalizeSelectors(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((sel) => ({
      taxonomy: String(sel?.taxonomy || '').toLowerCase(),
      termIds: (Array.isArray(sel?.term_ids) ? sel.term_ids : Array.isArray(sel?.termIds) ? sel.termIds : []).map(toInt).filter(Boolean),
      terms: (Array.isArray(sel?.terms) ? sel.terms : []).map((t) => ({
        id: toInt(t?.id ?? t?.databaseId),
        slug: String(t?.slug || ''),
        name: String(t?.name || ''),
      })),
    }))
    .filter((sel) => sel.taxonomy && (sel.termIds.length || sel.terms.length));
}

/** WordPress `psp/v1/upsell/rules/active` payload (snake_case) → UpsellRulePublic (camelCase). */
export function normalizeWpRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = toInt(raw.id ?? raw.databaseId);
  if (!id) return null;
  const amount = Number(raw.discount?.amount || 0);
  return {
    id,
    name: String(raw.name || ''),
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 10,
    hash: String(raw.hash || ''),
    channels: Array.isArray(raw.channels) ? raw.channels.map((c) => String(c).toLowerCase()) : [],
    trigger: {
      selectors: normalizeSelectors(raw.trigger?.selectors),
      label: String(raw.trigger?.label ?? raw.trigger?.trigger_label ?? ''),
      minQty: Math.max(1, toInt(raw.trigger?.min_qty ?? raw.trigger?.minQty) || 1),
    },
    target: {
      selectors: normalizeSelectors(raw.target?.selectors),
      match: (raw.target?.match ?? raw.target?.targetMatch) === 'any' ? 'any' : 'all',
      label: String(raw.target?.label ?? raw.target?.target_label ?? ''),
      excludeTriggerItems: !(raw.target?.exclude_trigger_items === false || raw.target?.excludeTriggerItems === false),
    },
    discount: {
      type: 'percent',
      amount,
      display: String(raw.discount?.display || `${amount}%`),
    },
    schedule: {
      startsAt: raw.schedule?.starts_at ?? raw.schedule?.startsAt ?? null,
      endsAt: raw.schedule?.ends_at ?? raw.schedule?.endsAt ?? null,
    },
    notices: {
      en: raw.notices?.en && typeof raw.notices.en === 'object' ? raw.notices.en : {},
      fr: raw.notices?.fr && typeof raw.notices.fr === 'object' ? raw.notices.fr : {},
    },
    cta: {
      triggerSide: String(raw.cta?.trigger_side ?? raw.cta?.triggerSide ?? '/products'),
      targetSide: String(raw.cta?.target_side ?? raw.cta?.targetSide ?? '/products'),
    },
  };
}

export function isRuleActiveOn(rule, todayISO) {
  const startsAt = rule?.schedule?.startsAt || null;
  const endsAt = rule?.schedule?.endsAt || null;
  if (startsAt && todayISO < startsAt) return false;
  if (endsAt && todayISO > endsAt) return false;
  return true;
}

/**
 * Terms of a product as the cached PDP payload exposes them:
 * productCategories.nodes (ids + slugs), terms.nodes (taxonomyName + slug), and
 * global attribute terms (taxonomyName + databaseId + slug).
 */
export function extractProductTerms(product) {
  const out = [];
  const push = (taxonomy, id, slug) => {
    const tax = String(taxonomy || '').toLowerCase();
    if (!tax) return;
    out.push({taxonomy: tax, id: toInt(id) || undefined, slug: slug ? String(slug) : undefined});
  };
  for (const node of product?.productCategories?.nodes || []) push('product_cat', node?.databaseId, node?.slug);
  for (const node of product?.terms?.nodes || []) push(node?.taxonomyName || node?.taxonomy, node?.databaseId, node?.slug);
  for (const attr of product?.attributes?.nodes || []) {
    for (const term of attr?.terms?.nodes || []) push(term?.taxonomyName, term?.databaseId, term?.slug);
  }
  return out;
}

export function selectorMatches(productTerms, selector) {
  const ids = new Set(selector.termIds || []);
  const slugs = new Set((selector.terms || []).map((t) => t.slug).filter(Boolean));
  return (productTerms || []).some((term) => term.taxonomy === selector.taxonomy && ((term.id && ids.has(term.id)) || (term.slug && slugs.has(term.slug))));
}

export function matchesTrigger(productTerms, rule) {
  return (rule?.trigger?.selectors || []).some((sel) => selectorMatches(productTerms, sel));
}

export function matchesTarget(productTerms, rule) {
  const selectors = rule?.target?.selectors || [];
  if (!selectors.length) return false;
  return rule.target.match === 'any' ? selectors.some((sel) => selectorMatches(productTerms, sel)) : selectors.every((sel) => selectorMatches(productTerms, sel));
}

export function renderNotice(rule, key, locale = 'en') {
  const loc = String(locale || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const template = rule?.notices?.[loc]?.[key] || rule?.notices?.en?.[key] || NOTICE_DEFAULTS[key] || '';
  return String(template)
    .replace(/\{discount\}/g, rule?.discount?.display || '')
    .replace(/\{trigger\}/g, rule?.trigger?.label || '')
    .replace(/\{target\}/g, rule?.target?.label || '');
}

/** Offers to show on a product page. A product that is both trigger and target is shown on the trigger side. */
export function matchProduct(productTerms, rules, options = {}) {
  const locale = options.locale || 'en';
  const today = options.today || torontoToday();
  const out = [];
  for (const rule of rules || []) {
    if (!rule || !isRuleActiveOn(rule, today)) continue;
    if (matchesTrigger(productTerms, rule)) {
      out.push({rule, side: 'trigger', text: renderNotice(rule, 'product_trigger', locale), ctaPath: rule.cta.triggerSide, ctaLabel: rule.target.label});
    } else if (matchesTarget(productTerms, rule)) {
      out.push({rule, side: 'target', text: renderNotice(rule, 'product_target', locale), ctaPath: rule.cta.targetSide, ctaLabel: rule.trigger.label});
    }
  }
  out.sort((a, b) => a.rule.priority - b.rule.priority || a.rule.id - b.rule.id);
  return out;
}
