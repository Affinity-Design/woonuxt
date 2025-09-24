// Composable for Turnstile integration across the application
export const useTurnstile = () => {
  const config = useRuntimeConfig();
  const turnstileToken = ref<string>('');
  const turnstileError = ref<string>('');
  const turnstileMounted = ref<boolean>(false);
  const isVerifying = ref<boolean>(false);

  // Get site key from config
  const siteKey = computed(() => config.public.turnstyleSiteKey);

  // Reset Turnstile state
  const resetTurnstile = () => {
    turnstileToken.value = '';
    turnstileError.value = '';
    turnstileMounted.value = false;
    isVerifying.value = false;

    // Reset the actual Turnstile widget if available
    if (process.client && (window as any).turnstile) {
      try {
        (window as any).turnstile.reset();
      } catch (error) {
        console.warn('Failed to reset Turnstile widget:', error);
      }
    }
  };

  // Verify Turnstile token
  const verifyTurnstile = async (showError = true): Promise<boolean> => {
    if (isVerifying.value) {
      console.log('Turnstile verification already in progress');
      return false;
    }

    turnstileError.value = '';

    if (!turnstileToken.value) {
      if (showError) {
        turnstileError.value = 'Please complete the security check';
      }
      return false;
    }

    isVerifying.value = true;

    try {
      console.log('🔐 Verifying Turnstile token...');

      const response = await $fetch<{
        success: boolean;
        error?: string;
        verified?: boolean;
      }>('/api/verify-turnstile', {
        method: 'POST',
        body: {
          turnstileToken: turnstileToken.value,
        },
      });

      if (response.success) {
        console.log('✅ Turnstile verification successful');
        return true;
      } else {
        console.error('❌ Turnstile verification failed:', response.error);
        if (showError) {
          turnstileError.value = response.error || 'Security verification failed';
        }
        return false;
      }
    } catch (error) {
      console.error('❌ Turnstile verification error:', error);
      if (showError) {
        turnstileError.value = 'Security verification failed';
      }
      return false;
    } finally {
      isVerifying.value = false;
    }
  };

  // Handle Turnstile verification event
  const onTurnstileVerify = (token: string) => {
    turnstileToken.value = token;
    turnstileMounted.value = true;
    turnstileError.value = '';
    console.log('Turnstile token received');
  };

  // Handle Turnstile error event
  const onTurnstileError = (error?: any) => {
    console.error('Turnstile error:', error);
    turnstileError.value = 'Security check failed - please try again';
    turnstileToken.value = '';
    turnstileMounted.value = false;
  };

  // Handle Turnstile expired event
  const onTurnstileExpired = () => {
    console.warn('Turnstile token expired');
    turnstileToken.value = '';
    turnstileMounted.value = false;
    turnstileError.value = 'Security check expired - please complete it again';
  };

  return {
    // State
    turnstileToken: readonly(turnstileToken),
    turnstileError: readonly(turnstileError),
    turnstileMounted: readonly(turnstileMounted),
    isVerifying: readonly(isVerifying),
    siteKey,

    // Methods
    resetTurnstile,
    verifyTurnstile,
    onTurnstileVerify,
    onTurnstileError,
    onTurnstileExpired,

    // For direct access (if needed)
    _setToken: (token: string) => {
      turnstileToken.value = token;
    },
    _setError: (error: string) => {
      turnstileError.value = error;
    },
  };
};
