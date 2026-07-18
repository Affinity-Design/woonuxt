import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchProductWithRetry, ProductNotFoundError} from '../server/utils/fetchProductWithRetry.mjs';

test('returns a product on the first successful fetch', async () => {
  const expectedProduct = {slug: 'available-product'};
  let fetchCount = 0;

  const product = await fetchProductWithRetry({
    slug: expectedProduct.slug,
    fetchProduct: async () => {
      fetchCount += 1;
      return {product: expectedProduct};
    },
    retryDelayMilliseconds: 0,
  });

  assert.equal(product, expectedProduct);
  assert.equal(fetchCount, 1);
});

test('retries transient failures and returns the uncached product', async () => {
  const expectedProduct = {slug: 'uncached-product'};
  let fetchCount = 0;

  const product = await fetchProductWithRetry({
    slug: expectedProduct.slug,
    fetchProduct: async () => {
      fetchCount += 1;
      if (fetchCount < 3) throw new Error('Temporary GraphQL failure');
      return {product: expectedProduct};
    },
    retryDelayMilliseconds: 0,
  });

  assert.equal(product, expectedProduct);
  assert.equal(fetchCount, 3);
});

test('preserves the upstream error after all retry attempts fail', async () => {
  const upstreamError = new Error('GraphQL unavailable');
  let fetchCount = 0;

  await assert.rejects(
    fetchProductWithRetry({
      slug: 'unavailable-product',
      fetchProduct: async () => {
        fetchCount += 1;
        throw upstreamError;
      },
      retryDelayMilliseconds: 0,
    }),
    upstreamError,
  );

  assert.equal(fetchCount, 3);
});

test('reports a missing product without retrying a successful response', async () => {
  let fetchCount = 0;

  await assert.rejects(
    fetchProductWithRetry({
      slug: 'missing-product',
      fetchProduct: async () => {
        fetchCount += 1;
        return {product: null};
      },
      retryDelayMilliseconds: 0,
    }),
    ProductNotFoundError,
  );

  assert.equal(fetchCount, 1);
});
