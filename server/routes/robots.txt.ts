/**
 * Host-aware robots.txt.
 *
 * Previously a static public/robots.txt, which shipped identically to every
 * environment — so test.proskatersplace.ca served "Allow: /" plus production's
 * sitemap URL and got itself indexed as a duplicate site.
 *
 * Production keeps the original directives; every other host (test.*,
 * *.pages.dev previews) gets a blanket disallow. The static file MUST stay
 * deleted: the cloudflare-pages preset lists /robots.txt in dist/_routes.json's
 * exclude array whenever public/robots.txt exists, which serves it from static
 * assets and bypasses this route entirely.
 */
const PRODUCTION_HOST = 'proskatersplace.ca';

const PRODUCTION_ROBOTS = `User-agent: *
Allow: /

Disallow: /cart
Disallow: /checkout
Disallow: /my-account
Disallow: /search

Sitemap: https://proskatersplace.ca/api/sitemap.xml
`;

const NON_PRODUCTION_ROBOTS = `User-agent: *
Disallow: /
`;

export default defineEventHandler((event) => {
  const host = (getRequestHost(event, {xForwardedHost: true}) || '').toLowerCase().split(':')[0];
  const isProduction = host === PRODUCTION_HOST;

  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  if (!isProduction) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
  }

  return isProduction ? PRODUCTION_ROBOTS : NON_PRODUCTION_ROBOTS;
});
