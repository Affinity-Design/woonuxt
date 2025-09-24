// Turnstile verification API endpoint for checkout and other forms
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  try {
    const {turnstileToken} = body;

    // Validate required configuration
    if (!config.public.turnstyleSecretKey || !turnstileToken) {
      console.error('Missing Turnstile configuration or token');
      return {
        success: false,
        error: 'Missing required Turnstile parameters',
      };
    }

    console.log('🔐 Verifying Turnstile token...');

    // Prepare Turnstile verification
    const formData = new FormData();
    formData.append('secret', config.public.turnstyleSecretKey);
    formData.append('response', turnstileToken);

    // Get client IP for verification
    const ip = event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress;

    if (ip) {
      const ipAddress = Array.isArray(ip) ? ip[0] : ip;
      if (typeof ipAddress === 'string') {
        formData.append('remoteip', ipAddress);
      }
    }

    // Verify with Cloudflare
    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const turnstileResult = await turnstileResponse.json();
    console.log('Turnstile verification result:', turnstileResult);

    if (!turnstileResult.success) {
      console.error('Turnstile verification failed:', turnstileResult);
      return {
        success: false,
        error: 'Security verification failed',
        details: turnstileResult['error-codes'] || [],
      };
    }

    console.log('✅ Turnstile verification successful');
    return {
      success: true,
      verified: true,
    };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return {
      success: false,
      error: 'Security verification failed due to server error',
    };
  }
});
