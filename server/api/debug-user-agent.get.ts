// Debug User Agent - Check what user agent the site is using for requests
export default defineEventHandler(async (event) => {
  console.log('🔍 User Agent Debug - Request Headers:');

  const headers = event.node.req.headers;

  const debugInfo = {
    userAgent: headers['user-agent'],
    allHeaders: Object.keys(headers).reduce(
      (acc, key) => {
        acc[key] = headers[key];
        return acc;
      },
      {} as Record<string, any>,
    ),
    requestUrl: event.node.req.url,
    method: event.node.req.method,
    timestamp: new Date().toISOString(),
  };

  console.log('User-Agent:', debugInfo.userAgent);
  console.log('Full headers:', debugInfo.allHeaders);

  return {
    success: true,
    userAgent: debugInfo.userAgent,
    headers: debugInfo.allHeaders,
    timestamp: debugInfo.timestamp,
    message: 'Check console for full debug output',
  };
});
