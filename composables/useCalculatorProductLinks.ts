import productRoutesJson from '~/data/product-routes.json';
import type {StorefrontChoice} from '~/composables/useStorefrontSelection';

const CA_HOST = 'https://proskatersplace.ca';

// Build a slug → CA path lookup from the generated product routes file.
const caProductRoutes: Record<string, string> = (() => {
  const routes = Array.isArray(productRoutesJson) ? productRoutesJson : Object.values(productRoutesJson);
  const map: Record<string, string> = {};
  for (const path of routes as string[]) {
    if (typeof path === 'string' && path.startsWith('/product/')) {
      map[path.slice('/product/'.length)] = path;
    }
  }
  return map;
})();

export interface CalculatorProductLink {
  slug: string;
  link?: string; // full .com permalink from WPGraphQL
  caPath: string | null;
  comPath: string;
}

export const useCalculatorProductLinks = () => {
  /**
   * Resolve the outbound product URL.
   * Canada → prefer CA permalink from product-routes.json; fall back to product.link (stripped to slug path) or /product/slug.
   * USA / International → use product.link (the real .com permalink with /shop/category/sub/slug/ structure).
   */
  const resolveHref = (product: {slug: string; link?: string}, storefront: StorefrontChoice | null): string | null => {
    if (storefront === 'canada') {
      const caPath = caProductRoutes[product.slug] ?? null;
      if (caPath) return `${CA_HOST}${caPath}`;
      // Not in the routes file — construct the standard CA product URL from slug.
      return `${CA_HOST}/product/${product.slug}/`;
    }

    // USA / International — use the real .com permalink
    if (product.link) return product.link;

    // Last resort fallback (should never reach here if link field is in the GraphQL query)
    return null;
  };

  const hasCaPath = (slug: string): boolean => Boolean(caProductRoutes[slug]);

  return {resolveHref, hasCaPath};
};
