// Validate Checkout Session - Checks if user has a valid pre-verified session
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  try {
    const {sessionToken} = body;

    if (!sessionToken) {
      return {
        valid: false,
        error: 'Session token is required',
      };
    }

    console.log('🔍 Validating checkout session:', sessionToken);

    // Retrieve session from storage
    const storage = useStorage('redis'); // or 'memory' for development
    const rawSessionData = await storage.getItem(sessionToken);

    if (!rawSessionData) {
      console.log('❌ Session not found or expired');
      return {
        valid: false,
        error: 'Session expired. Please complete security verification again.',
        requiresReauth: true,
      };
    }

    // Parse session data
    const sessionData = typeof rawSessionData === 'object' ? rawSessionData : JSON.parse(rawSessionData as string);

    // Check if session is still valid (within 5 minutes)
    const now = Date.now();
    if (now > sessionData.expiresAt) {
      console.log('❌ Session expired');
      await storage.removeItem(sessionToken); // Clean up expired session
      return {
        valid: false,
        error: 'Session expired. Please complete security verification again.',
        requiresReauth: true,
      };
    }

    const remainingTime = Math.floor((sessionData.expiresAt - now) / 1000);
    console.log(`✅ Session valid for ${remainingTime} more seconds`);

    return {
      valid: true,
      verified: sessionData.verified,
      expiresAt: sessionData.expiresAt,
      remainingSeconds: remainingTime,
      message: `Session valid for ${Math.floor(remainingTime / 60)} minutes and ${remainingTime % 60} seconds`,
    };
  } catch (error) {
    console.error('❌ Session validation error:', error);
    return {
      valid: false,
      error: 'Session validation failed',
    };
  }
});
