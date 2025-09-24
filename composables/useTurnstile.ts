// Turnstile Integration for WooNuxt Checkout
// Handles token generation and validation for spam protection

export function useTurnstile() {
  const config = useRuntimeConfig();
  const turnstileToken = ref<string>('');
  const isVerified = ref<boolean>(false);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Check if Turnstile is enabled and if we're in a valid environment
  const isEnabled = computed(() => {
    // Skip Turnstile on localhost for development (fixes error 110200)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log('🔐 Turnstile bypassed for localhost development (avoiding error 110200)');
      return false;
    }

    // Skip for development domains
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('localhost') ||
        window.location.hostname.includes('127.0.0.1') ||
        window.location.hostname.includes('.test') ||
        window.location.hostname.includes('.local'))
    ) {
      console.log('🔐 Turnstile bypassed for development domain:', window.location.hostname);
      return false;
    }

    return config.public.turnstile?.siteKey && process.env.TURNSTILE_ENABLED !== 'false';
  });

  // Generate new Turnstile token
  const generateToken = async (): Promise<string> => {
    if (!isEnabled.value) {
      console.log('🔐 Turnstile disabled, skipping token generation');
      return '';
    }

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.turnstile) {
        console.error('❌ Turnstile script not loaded');
        reject(new Error('Turnstile not loaded'));
        return;
      }

      // Check if container exists
      const container = document.getElementById('turnstile-container');
      if (!container) {
        console.error('❌ Turnstile container not found in DOM');
        reject(new Error('Turnstile container not found'));
        return;
      }

      isLoading.value = true;
      error.value = null;

      console.log('🔐 Initializing Turnstile widget...', {
        siteKey: config.public.turnstile.siteKey,
        hostname: window.location.hostname,
        url: window.location.href,
      });

      // Render invisible widget for checkout
      let widgetId: string;
      try {
        widgetId = window.turnstile.render(container, {
          sitekey: config.public.turnstile.siteKey,
          theme: 'light',
          size: 'compact',
          callback: (token: string) => {
            console.log('✅ Turnstile token generated successfully');
            turnstileToken.value = token;
            isVerified.value = true;
            isLoading.value = false;
            resolve(token);
          },
          'error-callback': (errorCode: string) => {
            console.error('❌ Turnstile error:', errorCode);

            if (errorCode === '110200') {
              console.error('🚨 Error 110200: Domain not authorized for this site key');
              error.value = 'Domain not authorized for security verification';
            } else {
              error.value = 'Security verification failed';
            }

            isLoading.value = false;
            reject(new Error(`Turnstile error: ${errorCode}`));
          },
          execution: 'execute',
        });

        if (widgetId) {
          console.log('🚀 Executing Turnstile challenge...');
          window.turnstile.execute(widgetId);
        }
      } catch (renderError: any) {
        console.error('❌ Failed to render Turnstile widget:', renderError);
        isLoading.value = false;
        reject(new Error('Failed to initialize Turnstile widget'));
      }
    });
  };

  // Verify token on server
  const verifyToken = async (token: string): Promise<boolean> => {
    if (!token || !isEnabled.value) {
      console.log('🔐 Skipping token verification:', {hasToken: !!token, isEnabled: isEnabled.value});
      return !isEnabled.value; // Pass if disabled, fail if enabled but no token
    }

    try {
      console.log('🔍 Verifying Turnstile token on server...');
      const response: any = await $fetch('/api/verify-turnstile', {
        method: 'POST',
        body: {token},
      });

      console.log('✅ Turnstile server verification result:', {success: response.success});
      return response.success === true;
    } catch (err: any) {
      console.error('❌ Turnstile server verification failed:', err);
      return false;
    }
  };

  // Reset verification state
  const reset = () => {
    turnstileToken.value = '';
    isVerified.value = false;
    error.value = null;
    isLoading.value = false;
    console.log('🔄 Turnstile state reset');
  };

  return {
    turnstileToken,
    isVerified,
    isLoading,
    error,
    isEnabled,
    generateToken,
    verifyToken,
    reset,
  };
}

// Global Turnstile type declarations
declare global {
  interface Window {
    turnstile: {
      render: (container: HTMLElement | string, options: any) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}
