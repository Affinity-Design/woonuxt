/**
 * Sitemap redirect - makes sitemap accessible at /sitemap.xml (SEO standard)
 * This redirects to the actual API endpoint at /api/sitemap.xml
 */
export default defineEventHandler((event) => {
  return sendRedirect(event, '/api/sitemap.xml', 301);
});
