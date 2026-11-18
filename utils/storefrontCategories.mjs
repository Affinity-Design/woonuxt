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
