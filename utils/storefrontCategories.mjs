// Hide retired departments in the Canadian storefront without deleting shared catalog terms or products.
const retiredCategorySlugs = new Set([
  'alpine-accessories',
  'alpine-clothing',
  'alpine-poles',
  'alpine-protection',
  'alpine-ski-boots',
  'alpine-skis',
  'bindings-and-parts',
  'board-components-parts',
  'board-tools',
  'board-wheels',
  'cross-country-poles',
  'cross-country-skis',
  'longboards',
  'nordic-accessories',
  'nordic-clothing',
  'nordic-ski-boots',
  'penny-boards',
  'roller-skis',
  'rollerski-parts-accessoires',
  'scooter-parts',
  'scooters',
  'shortboard-skateboards',
  'skateboards-and-longboards',
  'ski-wax',
  'skiboards',
  'trick-scooters',
  'vinylboards',
  'winter-sports',
]);

export function isRetiredStorefrontCategory(slug) {
  return retiredCategorySlugs.has(slug);
}

const categoryPathPattern = /^\/product-category\/([^/?#]+)\/?(?:[?#].*)?$/;

/** Slug from a `/product-category/<slug>` path, or null when the path is not a category archive. */
export function categorySlugFromPath(path) {
  const match = categoryPathPattern.exec(String(path ?? ''));
  return match ? match[1] : null;
}

export function isRetiredStorefrontCategoryPath(path) {
  const slug = categorySlugFromPath(path);
  return slug !== null && isRetiredStorefrontCategory(slug);
}

/** Drops retired departments from category nodes (anything with a `slug`). */
export function withoutRetiredCategories(categories) {
  return categories.filter((category) => !isRetiredStorefrontCategory(category?.slug));
}

/** Drops retired departments from a list of `/product-category/<slug>` paths. */
export function withoutRetiredCategoryPaths(paths) {
  return paths.filter((path) => !isRetiredStorefrontCategoryPath(path));
}
