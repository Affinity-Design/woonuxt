import assert from 'node:assert/strict';
import test from 'node:test';
import {getDefaultProductAttributes} from '../utils/productDefaultAttributes.mjs';

test('returns default variation attributes from a GraphQL connection', () => {
  const defaultAttribute = {
    name: 'pa_size_parts_accessories',
    value: 'xl',
  };

  assert.deepEqual(getDefaultProductAttributes({nodes: [defaultAttribute]}), [defaultAttribute]);
});

test('returns an empty list when a product has no default attributes', () => {
  assert.deepEqual(getDefaultProductAttributes(null), []);
});
