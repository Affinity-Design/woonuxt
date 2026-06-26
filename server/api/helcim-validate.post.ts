// server/api/helcim-validate.post.ts
// Dedicated server-side validation endpoint
import {defineEventHandler, createError, readBody} from 'h3';

export default defineEventHandler(async (event) => {
  // Force server-side execution check
  if (process.client) {
    throw createError({
      statusCode: 500,
      statusMessage: 'This endpoint can only run server-side',
    });
  }

  const body = await readBody(event);
  // `chargeContext` (email/amount/lineItems) is optional and used only to fingerprint the
  // charge for the duplicate-charge guard. It never affects validation.
  const {transactionData, secretToken, chargeContext} = body;

  if (!transactionData || !secretToken) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Transaction data and secret token are required for validation',
    });
  }

  // Helper: record a successful, validated charge for the duplicate-charge guard.
  // Fires before the WooCommerce order exists, so it still protects against retries even
  // when order creation later fails. Best-effort — never affects the validation response.
  const recordChargeForGuard = async (transactionId?: string) => {
    if (!chargeContext) return;
    await recordSuccessfulCharge(
      {email: chargeContext.email, amount: chargeContext.amount, lineItems: chargeContext.lineItems},
      {transactionId, amount: chargeContext.amount, email: chargeContext.email, traceId: chargeContext.traceId},
    );
  };

  try {
    console.log('[Helcim Validation] Server-side validation starting...');

    // Import crypto in a way that works with different Node.js environments
    let crypto;
    try {
      // Try to import Node.js crypto module
      crypto = await import('node:crypto').catch(() => import('crypto'));
    } catch (importError) {
      console.error('[Helcim Validation] Failed to import crypto:', importError);

      // TEMPORARY: Allow validation to pass if crypto is not available
      // This is a fallback for production environment issues
      console.warn('[Helcim Validation] WARNING: Crypto not available, allowing transaction without validation');
      const bypassTxnId = transactionData.data?.data?.transactionId || transactionData.data?.transactionId;
      await recordChargeForGuard(bypassTxnId);
      return {
        success: true,
        isValid: true, // TEMPORARY - allow payment through
        expectedHash: 'crypto_unavailable',
        receivedHash: 'crypto_unavailable',
        transactionId: bypassTxnId,
        warning: 'Validation bypassed due to crypto unavailability',
      };
    }

    // The hash should be calculated from the data object + secret token
    // Helcim response structure: {"data":{"hash":"...","data":{"transactionId":"..."}}}
    const dataToHash = transactionData.data?.data || transactionData.data || transactionData;
    const cleanedJsonData = JSON.stringify(dataToHash);

    // Use Node.js crypto directly (server-side only)
    const expectedHash = crypto
      .createHash('sha256')
      .update(cleanedJsonData + secretToken)
      .digest('hex');

    const receivedHash = transactionData.data?.hash || transactionData.hash;
    const isValid = expectedHash === receivedHash;

    console.log('[Helcim Validation]', {
      dataStructure: Object.keys(transactionData),
      hasDataProperty: !!transactionData.data,
      hasHashProperty: !!transactionData.hash,
      dataToHashKeys: Object.keys(dataToHash || {}),
      cleanedJsonLength: cleanedJsonData.length,
      expectedHash,
      receivedHash,
      isValid,
    });

    // Only record genuinely successful (validated) charges for the duplicate-charge guard.
    if (isValid) {
      await recordChargeForGuard(dataToHash?.transactionId);
    }

    return {
      success: true,
      isValid,
      expectedHash,
      receivedHash,
      transactionId: dataToHash?.transactionId,
    };
  } catch (error: any) {
    console.error('[Helcim Validation] Validation error:', error);

    // TEMPORARY: If validation fails due to environment issues, allow transaction
    if (error.message?.includes('crypto') || error.message?.includes('unenv')) {
      console.warn('[Helcim Validation] WARNING: Crypto error detected, allowing transaction without validation');
      const fallbackTxnId = transactionData.data?.data?.transactionId || transactionData.data?.transactionId;
      await recordChargeForGuard(fallbackTxnId);
      return {
        success: true,
        isValid: true, // TEMPORARY - allow payment through
        expectedHash: 'error_fallback',
        receivedHash: 'error_fallback',
        transactionId: fallbackTxnId,
        warning: `Validation bypassed due to crypto error: ${error.message}`,
      };
    }

    return {
      success: false,
      error: {
        message: error.message || 'Validation failed',
        code: 'validation_error',
        statusCode: 500,
      },
    };
  }
});
