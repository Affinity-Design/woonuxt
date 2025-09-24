// GraphQL Turnstile Proxy - Validates Turnstile tokens before forwarding to WordPress Graph        'User-Agent': 'ProSkatersPlaceFrontend/1.0;',L
// This creates a secure proxy that validates tokens before passing requests to the backend

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  try {
    console.log('🔐 GraphQL Turnstile Proxy - Processing request...');

    // Check if this is a checkout mutation
    if (body.query && body.query.includes('checkout(')) {
      console.log('� Detected checkout mutation, validating Turnstile...');

      // Extract Turnstile token from metadata
      let turnstileToken = '';
      if (body.variables?.metaData) {
        const turnstileMetadata = body.variables.metaData.find((meta: any) => meta.key === '_turnstile_token');
        turnstileToken = turnstileMetadata?.value || '';
      }

      if (!turnstileToken) {
        console.error('❌ No Turnstile token found in checkout request');
        throw createError({
          statusCode: 400,
          statusMessage: 'Please verify that you are human.',
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

      const formData = new FormData();
      formData.append('secret', config.public.turnstyleSecretKey);
      formData.append('response', turnstileToken);

      // Get client IP
      const ip = event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress;

      if (ip) {
        const ipAddress = Array.isArray(ip) ? ip[0] : ip;
        if (typeof ipAddress === 'string') {
          formData.append('remoteip', ipAddress);
        }
      }

      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });

      const turnstileResult = await turnstileResponse.json();

      if (!turnstileResult.success) {
        console.error('❌ Turnstile verification failed:', turnstileResult);
        throw createError({
          statusCode: 400,
          statusMessage: 'Please verify that you are human.',
        });
      }

      console.log('✅ Turnstile verification successful');

      // Remove Turnstile token from metadata before forwarding to WordPress
      if (body.variables?.metaData) {
        body.variables.metaData = body.variables.metaData.filter((meta: any) => meta.key !== '_turnstile_token');
      }
    }

    // Forward the request to the actual GraphQL endpoint
    const graphqlEndpoint = `${config.public.wpBaseUrl}/graphql`;

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ProSkatersPlaceFrontend/1.0;',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    // Return the GraphQL response
    return result;
  } catch (error: any) {
    console.error('❌ GraphQL Turnstile Proxy error:', error);

    // Return GraphQL-formatted error
    return {
      data: null,
      errors: [
        {
          message: error.statusMessage || 'Security verification failed. Please try again.',
          locations: [{line: 3, column: 3}],
          path: ['checkout'],
        },
      ],
    };
  }
});
