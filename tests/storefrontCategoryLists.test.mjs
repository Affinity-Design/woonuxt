import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import test from 'node:test';
import {
  categorySlugFromPath,
  isRetiredStorefrontCategory,
  isRetiredStorefrontCategoryPath,
  listRetiredStorefrontCategorySlugs,
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

test('lists every retired slug so each one can get a noindex rule', () => {
  const slugs = listRetiredStorefrontCategorySlugs();
  assert.ok(slugs.length > 0);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(slugs.filter((slug) => !isRetiredStorefrontCategory(slug)), []);
  for (const slug of ['scooters', 'skateboards-and-longboards', 'alpine-skis', 'winter-sports']) {
    assert.ok(slugs.includes(slug), slug);
  }
  assert.equal(slugs.includes('ice-skates'), false);
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

test('blog posts do not link to retired category pages', () => {
  const blogDir = new URL('../content/blog/', import.meta.url);
  const offenders = [];
  for (const entry of readdirSync(blogDir, {withFileTypes: true})) {
    if (!entry.isDirectory() || !existsSync(new URL(`${entry.name}/index.md`, blogDir))) continue;
    const text = readFileSync(new URL(`${entry.name}/index.md`, blogDir), 'utf8');
    for (const [, linkPath] of text.matchAll(/\]\((\/product-category\/[^)\s]+)\)/g)) {
      if (isRetiredStorefrontCategoryPath(linkPath)) offenders.push(`${entry.name}: ${linkPath}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('size calculator no longer offers ski boots as a target category', () => {
  const source = readFileSync(new URL('../composables/useCalculator.ts', import.meta.url), 'utf8');
  const optionsBlock = source.slice(source.indexOf('const targetCategoryOptions'), source.indexOf('const sizeFieldLabels'));
  assert.ok(optionsBlock.includes("value: 'inline_skates'"));
  assert.equal(optionsBlock.includes('ski_boots'), false);
});

test('homepage hero slides and the merchant feed description do not advertise retired product lines', () => {
  const retiredLines = /scooter|skateboard|longboard|alpine|cross-country|\bskis?\b|skiing/i;
  const slides = readJson('data/custom/hero-banner.json');
  const slideCopy = slides.flatMap((slide) => [slide.title, slide.subtitle, slide.text]).filter(Boolean);
  assert.deepEqual(slideCopy.filter((copy) => retiredLines.test(copy)), []);

  const feedSource = readFileSync(new URL('../server/routes/merchant-feed.xml.ts', import.meta.url), 'utf8');
  const description = /<description>([^<]*)<\/description>/.exec(feedSource)?.[1] ?? '';
  assert.ok(description.length > 0);
  assert.equal(retiredLines.test(description), false);
});
