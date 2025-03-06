// server/api/debug-env.js
export default defineEventHandler(async (event) => {
  try {
    // Get runtime config to access environment variables
    const config = useRuntimeConfig();

    // Only allow this endpoint in development mode
    if (process.env.NODE_ENV === "production") {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Debug endpoint not available in production",
        }),
      };
    }

    // Check environment variables (mask sensitive info)
    const envCheck = {
      gmail: {
        hasClientId: !!config.GMAIL_CLIENT_ID,
        hasClientSecret: !!config.GMAIL_CLIENT_SECRET,
        hasRefreshToken: !!config.GMAIL_REFRESH_TOKEN,
        hasRedirectUri: !!config.GMAIL_REDIRECT_URI,
        hasReceivingEmail: !!config.RECEIVING_EMAIL,
        // Show first few characters of variables for debugging
        clientIdPrefix: config.GMAIL_CLIENT_ID
          ? config.GMAIL_CLIENT_ID.substring(0, 5) + "..."
          : null,
        refreshTokenPrefix: config.GMAIL_REFRESH_TOKEN
          ? config.GMAIL_REFRESH_TOKEN.substring(0, 5) + "..."
          : null,
      },
      turnstile: {
        hasSiteKey: !!config.public.turnstile?.siteKey,
        hasSecretKey: !!config.public.turnstyleSecretKey,
        // Check if we can access the keys correctly
        siteKeyPrefix: config.public.turnstile?.siteKey
          ? config.public.turnstile.siteKey.substring(0, 5) + "..."
          : null,
        secretKeyPrefix: config.public.turnstyleSecretKey
          ? config.public.turnstyleSecretKey.substring(0, 5) + "..."
          : null,
      },
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "Environment Check",
        details: envCheck,
        runtimeConfigKeys: Object.keys(config),
        publicConfigKeys: Object.keys(config.public || {}),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error checking environment",
        message: error.message,
        stack: process.env.NODE_ENV !== "production" ? error.stack : null,
      }),
    };
  }
});
