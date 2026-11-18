import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  categorySlugFromPath,
  isRetiredStorefrontCategoryPath,
  withoutRetiredCategories,
  withoutRetiredCategoryPaths,
} from '../utils/storefrontCategories.mjs';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));

test('reads the slug from category archive paths only', () => {
  assert.equal(categorySlugFromPath('/product-category/scooters'), 'scooters');
  assert.equal(categorySlugFromPath('/product-category/scooters/'), 'scooters');
  assert.equal(categorySlugFromPath('/product-category/inline-skates?filter=pa_brand[rollerblade]'), 'inline-skates');
  assert.equal(categorySlugFromPath('/product/scooters'), null);
  assert.equal(categorySlugFromPath('/product-category/'), null);
  assert.equal(categorySlugFromPath(undefined), null);
});

test('flags retired category paths and leaves every other URL alone', () => {
  assert.equal(isRetiredStorefrontCategoryPath('/product-category/alpine-skis'), true);
  assert.equal(isRetiredStorefrontCategoryPath('/product-category/winter-sports/'), true);
  assert.equal(isRetiredStorefrontCategoryPath('/product-category/ice-skates'), false);
  assert.equal(isRetiredStorefrontCategoryPath('/blog/scooters'), false);
  assert.equal(isRetiredStorefrontCategoryPath('/'), false);
});

test('drops retired departments from live category nodes and keeps the order of the rest', () => {
  const liveNodes = [{slug: 'accessories'}, {slug: 'scooters'}, {slug: 'inline-skates'}, {slug: 'ski-wax'}, {slug: 'ice-skates'}];
  assert.deepEqual(
    withoutRetiredCategories(liveNodes).map((node) => node.slug),
    ['accessories', 'inline-skates', 'ice-skates'],
  );
});

test('drops retired departments from category route lists', () => {
  assert.deepEqual(withoutRetiredCategoryPaths(['/product-category/roller-skates', '/product-category/skiboards', '/product-category/skate-tools']), [
    '/product-category/roller-skates',
    '/product-category/skate-tools',
  ]);
});

test('committed category routes list no retired department', () => {
  assert.deepEqual(readJson('data/category-routes.json').filter(isRetiredStorefrontCategoryPath), []);
});

test('committed sitemap data lists no retired category and its counts still add up', () => {
  const sitemap = readJson('data/sitemap-data.json');
  const categoryUrls = sitemap.routes.filter((route) => route.type === 'category').map((route) => route.url);

  assert.deepEqual(categoryUrls.filter(isRetiredStorefrontCategoryPath), []);
  assert.equal(sitemap.breakdown.categories, categoryUrls.length);
  assert.equal(sitemap.totalRoutes, sitemap.routes.length);
});
