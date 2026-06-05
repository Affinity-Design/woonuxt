import type {MaybeRefOrGetter} from 'vue';

/**
 * Slugs of the hidden WooCommerce categories that drive product-card badges.
 * A product is tagged in WP by adding it to one of these categories; the chip
 * appears/disappears with category membership — no code change needed.
 * A future rename only touches this one map.
 */
export const BADGE_CATEGORY_SLUGS = {
  new: 'new-arrivals',
  clearance: 'clearance-items',
} as const;

/**
 * Reads a product node's `productCategories.nodes[].slug` and decides which
 * card badges to show. Works with any data source that includes the category
 * slugs (getProductsForCards, getProductsWithCursor, the cached products JSON,
 * and the category-page batched query).
 */
export function useProductBadges(node: MaybeRefOrGetter<Product | null | undefined>) {
  const slugs = computed<string[]>(() => {
    const n = toValue(node);
    return ((n?.productCategories?.nodes ?? []) as Array<{slug?: string | null}>).map((c) => c?.slug).filter((slug): slug is string => Boolean(slug));
  });

  const isNew = computed(() => slugs.value.includes(BADGE_CATEGORY_SLUGS.new));
  const isClearance = computed(() => slugs.value.includes(BADGE_CATEGORY_SLUGS.clearance));

  return {isNew, isClearance};
}
