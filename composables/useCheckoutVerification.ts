// Composable for managing Turnstile pre-verification and checkout sessions
export const useCheckoutVerification = () => {
  const sessionToken = ref<string>('');
  const isVerified = ref<boolean>(false);
  const expiresAt = ref<number>(0);
  const remainingTime = ref<number>(0);
  const verificationError = ref<string>('');
  const isVerifying = ref<boolean>(false);
  const needsReauth = ref<boolean>(true);

  // Timer to update remaining time
  let countdownTimer: NodeJS.Timeout | null = null;

  // Pre-verify with Turnstile token
  const preVerifyCheckout = async (turnstileToken: string): Promise<boolean> => {
    if (isVerifying.value) {
      console.log('Verification already in progress');
      return false;
    }

    isVerifying.value = true;
    verificationError.value = '';

    try {
      console.log('🔐 Pre-verifying checkout session...');

      const response = await $fetch<{
        success: boolean;
        verified?: boolean;
        sessionToken?: string;
        expiresAt?: number;
        error?: string;
        message?: string;
      }>('/api/pre-verify-checkout', {
        method: 'POST',
        body: {
          turnstileToken,
        },
      });

      if (response.success && response.sessionToken) {
        sessionToken.value = response.sessionToken;
        isVerified.value = true;
        expiresAt.value = response.expiresAt || 0;
        needsReauth.value = false;

        console.log('✅ Checkout session created successfully');
        console.log('📋 Message:', response.message);

        // Start countdown timer
        startCountdownTimer();

        return true;
      } else {
        console.error('❌ Pre-verification failed:', response.error);
        verificationError.value = response.error || 'Verification failed';
        return false;
      }
    } catch (error: any) {
      console.error('❌ Pre-verification error:', error);
      verificationError.value = error.message || 'Verification failed';
      return false;
    } finally {
      isVerifying.value = false;
    }
  };

  // Validate current session
  const validateSession = async (): Promise<boolean> => {
    if (!sessionToken.value) {
      needsReauth.value = true;
      return false;
    }

    try {
      const response = await $fetch<{
        valid: boolean;
        verified?: boolean;
        expiresAt?: number;
        remainingSeconds?: number;
        error?: string;
        requiresReauth?: boolean;
      }>('/api/validate-checkout-session', {
        method: 'POST',
        body: {
          sessionToken: sessionToken.value,
        },
      });

      if (response.valid) {
        isVerified.value = response.verified || false;
        expiresAt.value = response.expiresAt || 0;
        remainingTime.value = response.remainingSeconds || 0;
        needsReauth.value = false;

        // Restart countdown timer if needed
        if (!countdownTimer) {
          startCountdownTimer();
        }

        return true;
      } else {
        console.log('❌ Session invalid:', response.error);
        clearSession();
        needsReauth.value = response.requiresReauth || true;
        verificationError.value = response.error || 'Session expired';
        return false;
      }
    } catch (error: any) {
      console.error('❌ Session validation error:', error);
      clearSession();
      needsReauth.value = true;
      return false;
    }
  };

  // Clear session data
  const clearSession = () => {
    sessionToken.value = '';
    isVerified.value = false;
    expiresAt.value = 0;
    remainingTime.value = 0;
    needsReauth.value = true;

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  // Start countdown timer
  const startCountdownTimer = () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }

    countdownTimer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt.value - now) / 1000));

      remainingTime.value = remaining;

      if (remaining <= 0) {
        console.log('⏰ Checkout session expired');
        clearSession();
      }
    }, 1000);
  };

  // Format remaining time for display
  const formattedRemainingTime = computed(() => {
    const minutes = Math.floor(remainingTime.value / 60);
    const seconds = remainingTime.value % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  // Check if session is about to expire (less than 30 seconds)
  const isExpiringSoon = computed(() => remainingTime.value > 0 && remainingTime.value < 30);

  // Auto-validate session on mount
  onMounted(async () => {
    if (sessionToken.value) {
      await validateSession();
    }
  });

  // Clean up timer on unmount
  onUnmounted(() => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
  });

  return {
    // State
    sessionToken: readonly(sessionToken),
    isVerified: readonly(isVerified),
    expiresAt: readonly(expiresAt),
    remainingTime: readonly(remainingTime),
    verificationError: readonly(verificationError),
    isVerifying: readonly(isVerifying),
    needsReauth: readonly(needsReauth),
    formattedRemainingTime,
    isExpiringSoon,

    // Methods
    preVerifyCheckout,
    validateSession,
    clearSession,

    // For direct access if needed
    _setSessionToken: (token: string) => {
      sessionToken.value = token;
    },
  };
};
