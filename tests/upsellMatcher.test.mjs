import assert from 'node:assert/strict';
import test from 'node:test';
import {extractProductTerms, isRuleActiveOn, matchProduct, matchesTarget, matchesTrigger, normalizeWpRule, renderNotice} from '../shared/utils/upsellMatcher.mjs';

const wpRule = {
  id: 4120,
  name: 'Endless frames → 20% off Endless wheels',
  priority: 10,
  hash: 'abc',
  channels: ['ca', 'com'],
  trigger: {
    selectors: [{taxonomy: 'product_cat', term_ids: [312, 313], terms: [{id: 312, slug: 'endless-frames', name: 'Endless Frames'}]}],
    label: 'Endless Frames',
    min_qty: 1,
  },
  target: {
    selectors: [
      {taxonomy: 'pa_manufacturer', term_ids: [1187], terms: [{id: 1187, slug: 'endless', name: 'Endless'}]},
      {taxonomy: 'product_cat', term_ids: [77, 78], terms: [{id: 77, slug: 'wheels', name: 'Wheels'}]},
    ],
    match: 'all',
    label: 'Endless wheels',
    exclude_trigger_items: true,
  },
  discount: {type: 'percent', amount: 20, display: '20%'},
  schedule: {starts_at: null, ends_at: null},
  notices: {en: {product_trigger: 'Pair this with any {target} and get {discount} off'}, fr: {product_target: 'Ajoutez un {trigger} pour {discount}'}},
  cta: {trigger_side: '/product-category/wheels?filter=pa_manufacturer[endless]', target_side: '/product-category/endless-frames'},
};

const cachedProduct = (categoryIds, manufacturerSlug) => ({
  productCategories: {nodes: categoryIds.map((id) => ({databaseId: id, slug: `cat-${id}`}))},
  terms: {nodes: [...categoryIds.map((id) => ({taxonomyName: 'product_cat', slug: `cat-${id}`})), ...(manufacturerSlug ? [{taxonomyName: 'pa_manufacturer', slug: manufacturerSlug}] : [])]},
  attributes: {nodes: manufacturerSlug ? [{terms: {nodes: [{taxonomyName: 'pa_manufacturer', databaseId: 0, slug: manufacturerSlug}]}}] : []},
});

test('normalizes the WordPress payload into camelCase with expanded ids and picked terms', () => {
  const rule = normalizeWpRule(wpRule);
  assert.equal(rule.id, 4120);
  assert.deepEqual(rule.trigger.selectors[0].termIds, [312, 313]);
  assert.equal(rule.trigger.selectors[0].terms[0].slug, 'endless-frames');
  assert.equal(rule.target.match, 'all');
  assert.equal(rule.target.excludeTriggerItems, true);
  assert.equal(rule.discount.display, '20%');
  assert.equal(rule.cta.triggerSide, '/product-category/wheels?filter=pa_manufacturer[endless]');
  assert.equal(normalizeWpRule(null), null);
  assert.equal(normalizeWpRule({name: 'no id'}), null);
});

test('child category ids match through the expanded term id set', () => {
  const rule = normalizeWpRule(wpRule);
  assert.equal(matchesTrigger(extractProductTerms(cachedProduct([313], null)), rule), true);
  assert.equal(matchesTrigger(extractProductTerms(cachedProduct([999], null)), rule), false);
});

test('target match "all" requires brand AND category; "any" accepts either', () => {
  const all = normalizeWpRule(wpRule);
  const wheelsOnly = extractProductTerms(cachedProduct([78], 'powerslide'));
  const endlessWheels = extractProductTerms(cachedProduct([78], 'endless'));
  assert.equal(matchesTarget(wheelsOnly, all), false);
  assert.equal(matchesTarget(endlessWheels, all), true);

  const any = normalizeWpRule({...wpRule, target: {...wpRule.target, match: 'any'}});
  assert.equal(matchesTarget(wheelsOnly, any), true);
});

test('a product that is both trigger and target is shown on the trigger side only', () => {
  const rule = normalizeWpRule(wpRule);
  const both = extractProductTerms(cachedProduct([312, 77], 'endless'));
  const matches = matchProduct(both, [rule], {today: '2026-09-11'});
  assert.equal(matches.length, 1);
  assert.equal(matches[0].side, 'trigger');
  assert.equal(matches[0].ctaPath, rule.cta.triggerSide);
  assert.equal(matches[0].ctaLabel, 'Endless wheels');
});

test('target products get the target-side notice and CTA back to the trigger listing', () => {
  const rule = normalizeWpRule(wpRule);
  const matches = matchProduct(extractProductTerms(cachedProduct([77], 'endless')), [rule], {today: '2026-09-11'});
  assert.equal(matches[0].side, 'target');
  assert.equal(matches[0].ctaPath, '/product-category/endless-frames');
  assert.equal(matches[0].text, 'Add any Endless Frames to get 20% off these');
});

test('schedule gating uses inclusive YYYY-MM-DD bounds', () => {
  const rule = normalizeWpRule({...wpRule, schedule: {starts_at: '2026-09-15', ends_at: '2026-09-30'}});
  assert.equal(isRuleActiveOn(rule, '2026-09-14'), false);
  assert.equal(isRuleActiveOn(rule, '2026-09-15'), true);
  assert.equal(isRuleActiveOn(rule, '2026-09-30'), true);
  assert.equal(isRuleActiveOn(rule, '2026-10-01'), false);
  assert.equal(matchProduct(extractProductTerms(cachedProduct([312], null)), [rule], {today: '2026-10-01'}).length, 0);
});

test('notices render placeholders, fall back from fr to en, then to defaults', () => {
  const rule = normalizeWpRule(wpRule);
  assert.equal(renderNotice(rule, 'product_trigger', 'en'), 'Pair this with any Endless wheels and get 20% off');
  assert.equal(renderNotice(rule, 'product_target', 'fr-CA'), 'Ajoutez un Endless Frames pour 20%');
  assert.equal(renderNotice(rule, 'product_trigger', 'fr'), 'Pair this with any Endless wheels and get 20% off');
  assert.equal(renderNotice(rule, 'cart_applied', 'en'), '20% off Endless wheels applied.');
});

test('matches are ordered by priority then id', () => {
  const a = normalizeWpRule({...wpRule, id: 2, priority: 20});
  const b = normalizeWpRule({...wpRule, id: 1, priority: 5});
  const matches = matchProduct(extractProductTerms(cachedProduct([312], null)), [a, b], {today: '2026-09-11'});
  assert.deepEqual(
    matches.map((m) => m.rule.id),
    [1, 2],
  );
});
