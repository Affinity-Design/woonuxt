export default defineEventHandler((event) => {
  // Get the client IP from Cloudflare headers
  const clientIp = getRequestHeader(event, 'cf-connecting-ip');

  if (clientIp) {
    // Add it to X-Forwarded-For so the proxy forwards it to WordPress
    // This ensures WordPress sees the actual user's IP, not the Nuxt server's IP
    // preventing rate-limiting of the Nuxt server
    const currentForwardedFor = getRequestHeader(event, 'x-forwarded-for');
    const newForwardedFor = currentForwardedFor ? `${currentForwardedFor}, ${clientIp}` : clientIp;

    event.node.req.headers['x-forwarded-for'] = newForwardedFor;
  }
});
