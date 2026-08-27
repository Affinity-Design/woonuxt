import assert from 'node:assert/strict';
import test from 'node:test';

import {buildTrailingSlashRedirectLocation} from '../utils/canonicalUrl.mjs';
import {getBlogImageSrcset} from '../utils/blogImage.mjs';
import {createCumulativeLayoutShiftAnalyticsPayload} from '../utils/seoTelemetry.mjs';

test('redirects crawlable content routes to their no-slash canonical URL', () => {
  assert.equal(buildTrailingSlashRedirectLocation('/product/example/', '?ref=guide'), '/product/example?ref=guide');
  assert.equal(buildTrailingSlashRedirectLocation('/product-category/inline-skates/', ''), '/product-category/inline-skates');
  assert.equal(buildTrailingSlashRedirectLocation('/blog/example/', ''), '/blog/example');
});

test('does not redirect the root, API routes, or canonical content URLs', () => {
  assert.equal(buildTrailingSlashRedirectLocation('/', ''), null);
  assert.equal(buildTrailingSlashRedirectLocation('/api/example/', ''), null);
  assert.equal(buildTrailingSlashRedirectLocation('/product/example', ''), null);
});

test('builds a bounded GA4 CLS attribution payload', () => {
  const payload = createCumulativeLayoutShiftAnalyticsPayload(
    {
      id: 'v1-123',
      value: 0.31,
      delta: 0.12,
      rating: 'poor',
      navigationType: 'navigate',
      attribution: {largestShiftTarget: '#'.repeat(150)},
    },
    'https://proskatersplace.ca/product/example',
  );

  assert.equal(payload.value, 0.12);
  assert.equal(payload.metric_value, 0.31);
  assert.equal(payload.debug_target.length, 100);
  assert.equal(payload.page_location, 'https://proskatersplace.ca/product/example');
});

test('builds responsive srcset only for optimized local blog images', () => {
  assert.equal(
    getBlogImageSrcset('/images/blog/posted/vancouver.webp'),
    '/images/blog/posted/vancouver-640.webp 640w, /images/blog/posted/vancouver.webp 1024w',
  );
  assert.equal(getBlogImageSrcset('https://example.com/image.webp'), undefined);
  assert.equal(getBlogImageSrcset('/images/blog/posted/vancouver.png'), undefined);
});
