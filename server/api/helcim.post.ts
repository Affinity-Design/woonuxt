// server/api/helcim.post.ts
import {defineEventHandler, createError, readBody} from 'h3';

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const helcimApiToken = runtimeConfig.helcimApiToken;

  // Ensure the API token is present
  if (!helcimApiToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Helcim API token is missing. Please check your configuration.',
    });
  }

  const body = await readBody(event);
  const {action, amount, currency = 'CAD', paymentType = 'purchase'} = body;

  try {
    // Handle different Helcim actions
    switch (action) {
      case 'initialize':
        if (!amount) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Amount is required for Helcim initialization',
          });
        }

        console.log(`[DEBUG Server] Helcim API request:`, {
          receivedAmount: amount,
          receivedAmountType: typeof amount,
          convertedAmount: Number(amount),
          currency: currency,
          paymentType: paymentType,
        });

        // HelcimCard now sends dollars directly, so use as-is
        const amountInDollars = Number(amount);

        console.log(`[DEBUG Server] Using amount in dollars for Helcim API:`, {
          receivedDollars: amount,
          finalAmountInDollars: amountInDollars,
        });

        const response = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-token': helcimApiToken as string,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            paymentType: paymentType,
            amount: amountInDollars, // Amount in dollars
            currency: currency,
            // Disable digital wallets - they don't return cardToken needed for refunds
            // Helcim docs say digitalWallet must be a string with format "googlePay:0,applePay:0"
            digitalWallet: 'googlePay:0,applePay:0',
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`[Helcim API] HTTP Error ${response.status}:`, errorData);
          throw new Error(`Helcim API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();

        console.log('[DEBUG Server] Helcim API response:', {
          hasCheckoutToken: !!data.checkoutToken,
          hasSecretToken: !!data.secretToken,
          sentAmount: amountInDollars,
        });

        return {
          success: true,
          checkoutToken: data.checkoutToken,
          secretToken: data.secretToken,
        };

      case 'validate':
        // Ensure this runs only on server-side
        if (process.client || typeof window !== 'undefined') {
          throw createError({
            statusCode: 500,
            statusMessage: 'Validation must run server-side only',
          });
        }

        const {transactionData, secretToken} = body;

        if (!transactionData || !secretToken) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Transaction data and secret token are required for validation',
          });
        }

        try {
          // The hash should be calculated from the data object + secret token
          // Helcim response structure: {"data":{"hash":"...","data":{"transactionId":"..."}}}
          const dataToHash = transactionData.data?.data || transactionData.data || transactionData;
          const cleanedJsonData = JSON.stringify(dataToHash);

          let expectedHash;

          // Check if we're in a Node.js environment with crypto module
          try {
            // Try Node.js crypto first (server-side)
            const crypto = await import('crypto');
            expectedHash = crypto
              .createHash('sha256')
              .update(cleanedJsonData + secretToken)
              .digest('hex');
          } catch (nodeError) {
            // Fallback to Web Crypto API if Node.js crypto not available
            if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
              const encoder = new TextEncoder();
              const data = encoder.encode(cleanedJsonData + secretToken);
              const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              expectedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            } else {
              throw new Error('No crypto implementation available');
            }
          }

          const receivedHash = transactionData.data?.hash || transactionData.hash;
          const isValid = expectedHash === receivedHash;

          console.log('[Helcim Validation]', {
            dataStructure: Object.keys(transactionData),
            hasDataProperty: !!transactionData.data,
            hasHashProperty: !!transactionData.hash,
            expectedHash,
            receivedHash,
            isValid,
          });

          return {
            success: true,
            isValid,
            expectedHash,
            receivedHash,
            transactionId: dataToHash.transactionId,
          };
        } catch (cryptoError: any) {
          console.error('[Helcim Validation] Crypto error:', cryptoError);
          throw createError({
            statusCode: 500,
            statusMessage: `Validation failed: ${cryptoError.message}`,
          });
        }

      default:
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid action. Supported actions: initialize, validate',
        });
    }
  } catch (error: any) {
    console.error(`[Helcim API] Error (${action}):`, error);

    return {
      success: false,
      error: {
        message: error.message || 'An error occurred with Helcim API',
        code: error.code || 'unknown_error',
        statusCode: error.statusCode || 500,
      },
    };
  }
});
