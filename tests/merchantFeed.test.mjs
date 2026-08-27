import test from 'node:test';
import assert from 'node:assert/strict';
import merchantFeedHelpers from '../scripts/lib/merchant-feed.js';

const {normalizeShippingWeight} = merchantFeedHelpers;

test('formats positive WooCommerce weights for Google Merchant Center', () => {
  assert.equal(normalizeShippingWeight('0.2'), '0.2 kg');
  assert.equal(normalizeShippingWeight('3.500'), '3.5 kg');
  assert.equal(normalizeShippingWeight(12, 'lb'), '12 lb');
});

test('omits missing and invalid shipping weights', () => {
  assert.equal(normalizeShippingWeight(''), undefined);
  assert.equal(normalizeShippingWeight(null), undefined);
  assert.equal(normalizeShippingWeight(0), undefined);
  assert.equal(normalizeShippingWeight(-1), undefined);
  assert.equal(normalizeShippingWeight('unknown'), undefined);
});

test('rejects units Google Merchant Center does not accept', () => {
  assert.throws(() => normalizeShippingWeight(1, 'stone'), /unsupported Google shipping weight unit/);
});
