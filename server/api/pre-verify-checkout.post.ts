// Pre-verification API - Verifies Turnstile and creates a checkout session
// This allows users to verify once and then checkout within 5 minutes

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  try {
    const {turnstileToken} = body;

    if (!turnstileToken) {
      return {
        success: false,
        error: 'Turnstile token is required',
      };
    }

    console.log('🔐 Pre-verifying Turnstile token for checkout session...');

    // Verify Turnstile token with Cloudflare
    const formData = new FormData();
    formData.append('secret', config.public.turnstyleSecretKey || '');
    formData.append('response', turnstileToken);

    // Get client IP for verification
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
      console.error('❌ Pre-verification failed:', turnstileResult);
      return {
        success: false,
        error: 'Security verification failed',
        details: turnstileResult['error-codes'] || [],
      };
    }

    console.log('✅ Pre-verification successful');

    // Create a checkout session token (valid for 5 minutes)
    const sessionData = {
      verified: true,
      timestamp: Date.now(),
      ip: typeof ip === 'string' ? ip : Array.isArray(ip) ? ip[0] : '',
      turnstileChallenge: turnstileResult.challenge_ts || Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    };

    // Generate a simple session token (in production, use JWT or similar)
    const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // Store in server-side session storage (using Nitro storage)
    const storage = useStorage('redis'); // or 'memory' for development
    const sessionKey = `checkout_session_${sessionToken.slice(-20)}_${Date.now()}`;

    await storage.setItem(sessionKey, sessionData, {
      ttl: 300, // 5 minutes TTL
    });

    console.log(`✅ Created checkout session: ${sessionKey} (expires in 5 minutes)`);

    return {
      success: true,
      verified: true,
      sessionToken: sessionKey, // Return the session key instead of the token
      expiresAt: sessionData.expiresAt,
      message: 'Security verification completed. You can now checkout within the next 5 minutes.',
    };
  } catch (error) {
    console.error('❌ Pre-verification error:', error);
    return {
      success: false,
      error: 'Security verification failed due to server error',
    };
  }
});
