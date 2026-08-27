import {buildTrailingSlashRedirectLocation} from '~/utils/canonicalUrl.mjs';

export default defineEventHandler((event) => {
  const requestMethod = event.method || event.node.req.method;
  if (requestMethod !== 'GET' && requestMethod !== 'HEAD') return;

  const requestUrl = getRequestURL(event);
  const redirectLocation = buildTrailingSlashRedirectLocation(requestUrl.pathname, requestUrl.search);

  if (redirectLocation) return sendRedirect(event, redirectLocation, 301);
});
