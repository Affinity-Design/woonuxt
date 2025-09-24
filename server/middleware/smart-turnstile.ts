// Smart Turnstile Bypass Middleware
// Allows legitimate traffic to bypass while still blocking spam

export default defineEventHandler(async (event) => {
  const url = getRouterParam(event, '0') || getRouterParams(event)?.['0'] || '';
  const config = useRuntimeConfig();

  // Only apply to GraphQL checkout requests
  if (!url.includes('graphql') || event.node.req.method !== 'POST') {
    return;
  }

  // Read the request body to check if it's a checkout mutation
  const body = await readBody(event);

  if (!body.query || !body.query.includes('checkout(')) {
    return; // Not a checkout request, skip validation
  }

  console.log('🔐 Checkout request detected, checking security...');

  // **BYPASS METHOD 1: User-Agent Whitelist**
  // Your main site can use a specific User-Agent to bypass
  const userAgent = event.node.req.headers['user-agent'] || '';
  const whitelistedUserAgents = [
    'ProSkatersPlaceFrontend', // Your main site identifier
  ];

  const isWhitelistedUserAgent = whitelistedUserAgents.some((agent) => userAgent.includes(agent));

  // **BYPASS METHOD 2: Origin-based bypass**
  // Trust requests from your main domains (.com and .ca sites)
  const origin = event.node.req.headers.origin || '';
  const referer = event.node.req.headers.referer || '';
  const trustedOrigins = [
    'https://proskatersplace.com', // Main .com site
    'https://www.proskatersplace.com', // WWW version of .com
    'https://proskatersplace.ca', // Main .ca site
    'https://www.proskatersplace.ca', // WWW version of .ca
    'https://test.proskatersplace.com', // Test .com site
    'https://test.proskatersplace.ca', // Test .ca site
    'http://localhost:3000', // For development
  ];

  const isTrustedOrigin = trustedOrigins.some((trusted) => origin === trusted || referer.startsWith(trusted));

  // **BYPASS METHOD 3: Special header**
  // Your main site can include a special header
  const bypassHeader = event.node.req.headers['x-bypass-turnstile'];
  const validBypassKey = config.public.turnstileBypassKey || process.env.TURNSTILE_BYPASS_KEY;
  const hasValidBypassHeader = bypassHeader === validBypassKey;

  // **ALLOW IF ANY BYPASS METHOD IS VALID**
  if (isWhitelistedUserAgent || isTrustedOrigin || hasValidBypassHeader) {
    console.log('✅ Bypassing Turnstile verification:', {
      userAgent: isWhitelistedUserAgent,
      origin: isTrustedOrigin,
      bypassHeader: hasValidBypassHeader,
    });
    return; // Allow the request to proceed without Turnstile
  }

  // **REQUIRE TURNSTILE FOR ALL OTHER REQUESTS**
  console.log('🛡️ Turnstile verification required for:', {
    userAgent: userAgent.substring(0, 100),
    origin,
    ip: event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'],
  });

  // Check if Turnstile is enabled
  if (process.env.TURNSTILE_ENABLED === 'false') {
    console.log('⚠️ Turnstile disabled via environment variable');
    return;
  }

  // Extract Turnstile token from request headers or metadata
  let turnstileToken = '';

  // Check headers first (preferred method)
  const tokenHeader = event.node.req.headers['x-turnstile-token'];
  turnstileToken = (Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader) || '';

  // Fallback: check metadata (legacy method)
  if (!turnstileToken && body.variables?.metaData) {
    const turnstileMetadata = body.variables.metaData.find((meta: any) => meta.key === '_turnstile_token');
    turnstileToken = turnstileMetadata?.value || '';
  }

  if (!turnstileToken) {
    console.error('❌ No Turnstile token found in request');
    throw createError({
      statusCode: 400,
      statusMessage: 'Security verification required. Please complete the challenge and try again.',
    });
  }

  // Verify Turnstile token
  if (!config.public.turnstyleSecretKey) {
    console.error('❌ Missing Turnstile secret key configuration');
    throw createError({
      statusCode: 500,
      statusMessage: 'Security verification service unavailable.',
    });
  }

  try {
    const formData = new FormData();
    formData.append('secret', config.public.turnstyleSecretKey);
    formData.append('response', turnstileToken);

    // Get client IP
    const clientIP = event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress;

    if (clientIP) {
      const ipAddress = Array.isArray(clientIP) ? clientIP[0] : clientIP;
      if (typeof ipAddress === 'string') {
        formData.append('remoteip', ipAddress);
      }
    }

    console.log('🔐 Verifying Turnstile token...');

    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const result = await turnstileResponse.json();

    if (!result.success) {
      console.error('❌ Turnstile verification failed:', result['error-codes']);
      throw createError({
        statusCode: 400,
        statusMessage: 'Security verification failed. Please try again.',
      });
    }

    console.log('✅ Turnstile verification successful');

    // Remove the token from metadata to prevent it from being sent to WordPress
    if (body.variables?.metaData) {
      body.variables.metaData = body.variables.metaData.filter((meta: any) => meta.key !== '_turnstile_token');
    }
  } catch (error: any) {
    console.error('❌ Turnstile verification error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Security verification failed.',
    });
  }
});
