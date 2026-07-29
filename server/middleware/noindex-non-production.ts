/**
 * Keep every non-production host out of Google's index.
 *
 * test.proskatersplace.ca was live, crawlable and INDEXED as a complete
 * duplicate of production (2026-07-23 audit) — no X-Robots-Tag, no meta robots,
 * and a copy of production's allow-all robots.txt.
 *
 * Any host that is not exactly the production apex gets noindex: the test
 * subdomain, every *.pages.dev preview alias, and any future environment.
 *
 * NOTE: this middleware only runs for requests that reach the Worker. The
 * cloudflare-pages preset writes dist/_routes.json with ~99 excluded paths
 * (the homepage, /blog and every post, /contact, /privacy, /terms, the size
 * calculator) which Cloudflare serves straight from static assets. public/_headers
 * covers those; the two mechanisms together close the gap.
 */
const PRODUCTION_HOST = 'proskatersplace.ca';

export default defineEventHandler((event) => {
  const host = (getRequestHost(event, {xForwardedHost: true}) || '').toLowerCase().split(':')[0];

  // Empty host (internal/prerender invocations) must not be tagged.
  if (!host) return;

  if (host !== PRODUCTION_HOST) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
  }
});
