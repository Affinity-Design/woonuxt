const TRAILING_SLASH_ROUTE_PREFIXES = ['/product/', '/product-category/', '/blog/'];

export function buildTrailingSlashRedirectLocation(pathname, search = '') {
  const isCrawlableContentRoute = TRAILING_SLASH_ROUTE_PREFIXES.some((routePrefix) => pathname.startsWith(routePrefix));
  if (!isCrawlableContentRoute || !pathname.endsWith('/')) return null;

  const canonicalPathname = pathname.replace(/\/+$/, '');
  return canonicalPathname ? `${canonicalPathname}${search}` : null;
}
