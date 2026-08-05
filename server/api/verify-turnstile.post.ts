// Turnstile Server-Side Verification Endpoint
// Validates tokens with Cloudflare's Siteverify API

export default defineEventHandler(async (event) => {
  try {
    const {token} = await readBody(event);
    const config = useRuntimeConfig();

    if (!token) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing Turnstile token',
      });
    }

    // Secret lives in server-side runtimeConfig; the public fallback covers builds that
    // predate moving it out of client-visible config.
    const turnstileSecretKey = (config as any).turnstileSecretKey || (config.public as any).turnstyleSecretKey;
    if (!turnstileSecretKey) {
      console.error('❌ Missing Turnstile secret key configuration');
      throw createError({
        statusCode: 500,
        statusMessage: 'Security verification service unavailable',
      });
    }

    // Prepare verification request
    const formData = new FormData();
    formData.append('secret', turnstileSecretKey);
    formData.append('response', token);

    // Get client IP for additional security
    const clientIP = event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress;
    if (clientIP) {
      const ipAddress = Array.isArray(clientIP) ? clientIP[0] : clientIP;
      if (typeof ipAddress === 'string') {
        formData.append('remoteip', ipAddress);
      }
    }

    console.log('🔐 Verifying Turnstile token with Cloudflare...');

    // Verify with Cloudflare
    const verificationResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const result = await verificationResponse.json();

    console.log('✅ Turnstile verification result:', {
      success: result.success,
      errorCodes: result['error-codes'],
      challengeTs: result.challenge_ts,
      hostname: result.hostname,
    });

    if (!result.success) {
      console.error('❌ Turnstile verification failed:', result['error-codes']);
      throw createError({
        statusCode: 400,
        statusMessage: 'Security verification failed',
      });
    }

    return {
      success: true,
      data: {
        success: result.success,
        challengeTs: result.challenge_ts,
        hostname: result.hostname,
        verified: true,
      },
    };
  } catch (error: any) {
    console.error('❌ Turnstile verification error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Security verification failed',
    });
  }
});
