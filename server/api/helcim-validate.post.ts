// server/api/helcim-validate.post.ts
// Dedicated server-side validation endpoint
import {defineEventHandler, createError, readBody} from 'h3';
import {getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';

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
  // Recorded under BOTH the cart fingerprint and the client-minted checkout attempt id (the
  // attempt id is the stronger signal: exact, reload-stable, drift-immune).
  const recordChargeForGuard = async (transactionId?: string) => {
    if (!chargeContext) return;
    await recordSuccessfulCharge(
      {email: chargeContext.email, amount: chargeContext.amount, lineItems: chargeContext.lineItems},
      {transactionId, amount: chargeContext.amount, email: chargeContext.email, traceId: chargeContext.traceId},
    );
    await recordAttemptChargeStrong(event, chargeContext.checkoutAttemptId, {
      transactionId,
      amount: chargeContext.amount,
      email: chargeContext.email,
      traceId: chargeContext.traceId,
    });
  };

  try {
    console.log('[Helcim Validation] Server-side validation starting...');

    // The hash should be calculated from the data object + secret token
    // Helcim response structure: {"data":{"hash":"...","data":{"transactionId":"..."}}}
    const dataToHash = transactionData.data?.data || transactionData.data || transactionData;
    const cleanedJsonData = JSON.stringify(dataToHash);

    // Web Crypto — node:crypto's createHash is an unimplemented stub on the Workers runtime
    // (took checkout down 2026-08-05). Both old "crypto unavailable" bypass branches are gone;
    // the hash now always computes.
    const expectedHash = await sha256Hex(cleanedJsonData + secretToken);

    const receivedHash = transactionData.data?.hash || transactionData.hash;
    const isValid = expectedHash === receivedHash;

    // MONITOR MODE: prod never actually enforced this comparison — until 2026-08-05 the
    // crypto-error bypass approved every request on Workers, so the comparison is unproven
    // against real Helcim responses there (client-side JSON.parse -> server JSON.stringify
    // may not round-trip Helcim's exact serialization). Failing here AFTER the card was
    // charged creates charged-but-no-order, so a mismatch passes through loudly logged
    // instead. Flip to true once a real order logs expectedHash === receivedHash.
    const HASH_VALIDATION_ENFORCED = false;

    console.log('[Helcim Validation]', {
      dataStructure: Object.keys(transactionData),
      hasDataProperty: !!transactionData.data,
      hasHashProperty: !!transactionData.hash,
      dataToHashKeys: Object.keys(dataToHash || {}),
      cleanedJsonLength: cleanedJsonData.length,
      isValid,
    });

    if (isValid) {
      // Only record genuinely successful (validated) charges for the duplicate-charge guard.
      await recordChargeForGuard(dataToHash?.transactionId);
    } else {
      console.error('[Helcim Validation] Hash mismatch detected. Hash values were withheld.', {enforced: HASH_VALIDATION_ENFORCED});
      await logCheckoutFailure(event, {
        stage: 'validate_failed',
        reason: `Helcim transaction hash validation failed (${HASH_VALIDATION_ENFORCED ? 'enforced' : 'monitor mode — passed through'})`,
        transactionId: dataToHash?.transactionId,
        checkoutAttemptId: chargeContext?.checkoutAttemptId,
        email: chargeContext?.email,
        cartTotal: chargeContext?.amount,
        requestId: chargeContext?.traceId,
      });
      if (!HASH_VALIDATION_ENFORCED) {
        await recordChargeForGuard(dataToHash?.transactionId);
        return {success: true, isValid: true, transactionId: dataToHash?.transactionId, warning: 'hash_mismatch_monitor_mode'};
      }
    }

    return {success: true, isValid, transactionId: dataToHash?.transactionId};
  } catch (error: any) {
    // Fail CLOSED — the old catch here approved any error mentioning 'crypto'/'unenv',
    // which is the branch that silently disabled validation on Workers for months.
    console.error('[Helcim Validation] Validation error:', getSafeErrorLogDetails(error));
    await logCheckoutFailure(event, {
      stage: 'validate_failed',
      reason: 'Validation endpoint error. Sensitive details were withheld.',
      checkoutAttemptId: chargeContext?.checkoutAttemptId,
      email: chargeContext?.email,
      cartTotal: chargeContext?.amount,
      requestId: chargeContext?.traceId,
    });

    return {
      success: false,
      error: {
        message: 'We could not validate the payment. Please contact customer service before trying again.',
        code: 'validation_error',
        statusCode: 500,
      },
    };
  }
});
