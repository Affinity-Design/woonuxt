export const DEFAULT_PUBLIC_ERROR_MESSAGE = 'Something went wrong. Please try again. If the problem continues, contact customer service.';

const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError', 'FetchError']);
const SAFE_ERROR_CODES = new Set([
  'ABORT_ERR',
  'BAD_USER_INPUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'FETCH_ERROR',
  'FORBIDDEN',
  'INTERNAL_SERVER_ERROR',
  'NETWORK_ERROR',
  'UNAUTHENTICATED',
]);
const SENSITIVE_FIELD_NAMES = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'authtoken',
  'bearertoken',
  'clientsecret',
  'confirmpassword',
  'credential',
  'credentials',
  'currentpassword',
  'newpassword',
  'onetimecode',
  'otp',
  'pass',
  'passcode',
  'passwd',
  'password',
  'passwordconfirmation',
  'privatekey',
  'refreshtoken',
  'secret',
  'secretkey',
  'secrettoken',
  'securitychallenge',
  'sessiontoken',
  'turnstiletoken',
  'twofactorcode',
  'wpadminapppassword',
  'woocommercesession',
]);
const SENSITIVE_FIELD_NAME_PARTS = [
  'password',
  'passwd',
  'passcode',
  'secret',
  'credential',
  'authorization',
  'privatekey',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'turnstiletoken',
  'bearertoken',
  'authtoken',
  'onetimecode',
  'twofactorcode',
];
const REQUIRED_RECOVERY_FIELD_NAMES = new Set(['cardtoken']);

function isSensitiveFieldName(normalizedKey) {
  if (REQUIRED_RECOVERY_FIELD_NAMES.has(normalizedKey)) return false;
  if (SENSITIVE_FIELD_NAMES.has(normalizedKey)) return true;
  if (normalizedKey === 'otp' || normalizedKey.endsWith('otp')) return true;
  return SENSITIVE_FIELD_NAME_PARTS.some((sensitivePart) => normalizedKey.includes(sensitivePart));
}

const AUTHENTICATION_FALLBACK_MESSAGES = {
  signIn: 'We could not sign you in. Check your details and try again.',
  providerSignIn: 'We could not complete that sign-in. Please try again.',
  register: 'We could not create your account. Please review your details and try again.',
  requestPasswordReset: 'We could not send the reset email right now. Please try again later.',
  resetPassword: 'We could not reset your password. Request a new reset link and try again.',
  loadOrders: 'We could not load your orders. Please try again.',
  loadDownloads: 'We could not load your downloads. Please try again.',
  signOut: 'We could not sign you out cleanly. Please refresh the page and try again.',
};

function readUntrustedErrorText(error) {
  if (typeof error === 'string') return error;

  const possibleMessages = [
    error?.gqlErrors?.[0]?.message,
    error?.data?.statusMessage,
    error?.data?.message,
    error?.error?.message,
    error?.statusMessage,
    error?.message,
  ];

  return String(possibleMessages.find((message) => typeof message === 'string') || '');
}

/**
 * True when the error says the operation is absent from the GraphQL schema
 * rather than that the request data was wrong.
 *
 * Deliberately narrow: `Variable "$input" got invalid value {...}` also contains
 * "is not defined by type", and that message embeds the submitted values, so it
 * must keep falling through to the action fallback.
 *
 * @param {string} lowercasedMessage Already-lowercased untrusted error text.
 */
export function isSchemaMismatchMessage(lowercasedMessage) {
  if (/got invalid value/.test(lowercasedMessage)) return false;

  return /cannot query field .* on type|unknown type|cannot represent|is not defined on type/.test(lowercasedMessage);
}

/**
 * Converts an untrusted authentication error into fixed customer-safe copy.
 * The original text is used only for classification and is never returned.
 */
export function getSafeAuthenticationErrorMessage(error, action = 'signIn') {
  const untrustedMessage = readUntrustedErrorText(error).toLowerCase();

  // A mutation the frontend depends on is missing from the WordPress schema
  // (e.g. deregistered by a security plugin). Retrying can never help, so say so
  // instead of inviting the customer to try again. The pattern matches only
  // graphql-php's schema-validation wording, which names types and fields —
  // never submitted values.
  if (isSchemaMismatchMessage(untrustedMessage)) {
    return 'This feature is temporarily unavailable. Please contact customer service.';
  }

  if (/2fa|two.?factor|authenticat|verification code|wfls/.test(untrustedMessage)) {
    return 'Enter a valid two-factor authentication code and try again.';
  }

  if (action === 'signIn' && /invalid_username|incorrect_password|invalid credentials|unknown email|password you entered/.test(untrustedMessage)) {
    return 'The email, username, or password is incorrect. Please try again.';
  }

  if (action === 'register' && /already (?:registered|exists)|existing_user|email address is already|username is already/.test(untrustedMessage)) {
    return 'An account already exists for those details. Please sign in or reset your password.';
  }

  if (
    (action === 'register' || action === 'resetPassword') &&
    /password/.test(untrustedMessage) &&
    /weak|strength|characters|minimum|too short/.test(untrustedMessage)
  ) {
    return 'Choose a stronger password and try again.';
  }

  if (action === 'resetPassword' && /invalid|expired|key|link/.test(untrustedMessage)) {
    return 'This password reset link is invalid or expired. Please request a new one.';
  }

  return AUTHENTICATION_FALLBACK_MESSAGES[action] || AUTHENTICATION_FALLBACK_MESSAGES.signIn;
}

/**
 * Returns only caller-authored fallback copy. Untrusted error text is intentionally ignored.
 */
export function getSafePublicErrorMessage(_error, fallbackMessage = DEFAULT_PUBLIC_ERROR_MESSAGE) {
  return fallbackMessage;
}

export function getSafeCartErrorMessage(error, fallbackMessage = 'We could not update your cart. Please try again.') {
  const untrustedMessage = readUntrustedErrorText(error).toLowerCase();

  if (/out of stock|not enough|only .* available|add that amount|quantity/.test(untrustedMessage)) {
    return 'The requested quantity is not available. Please update the quantity and try again.';
  }

  if (/coupon/.test(untrustedMessage)) {
    return 'That coupon could not be applied. Check the code and try again.';
  }

  return fallbackMessage;
}

export function getSafePaymentErrorMessage(error, fallbackMessage = 'We could not complete the payment. Please try again or contact customer service.') {
  const untrustedMessage = readUntrustedErrorText(error).toLowerCase();
  const errorCode = String(error?.code || error?.error?.code || '').toLowerCase();

  if (errorCode === 'recent_charge_detected' || /matching payment|duplicate charge|already (?:paid|charged)/.test(untrustedMessage)) {
    return 'A matching payment may already have gone through. Check your email for an order confirmation or contact customer service before trying again.';
  }

  if (/declined|insufficient funds|card was rejected/.test(untrustedMessage)) {
    return 'The payment was declined. Please check your card details or use another payment method.';
  }

  return fallbackMessage;
}

/**
 * Produces diagnostic metadata without messages, stacks, response bodies, URLs, or request input.
 */
export function getSafeErrorLogDetails(error) {
  const details = {};
  const errorName = typeof error?.name === 'string' && SAFE_ERROR_NAMES.has(error.name) ? error.name : '';
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.status);
  const errorCode = String(error?.code || error?.error?.code || '');

  if (errorName) details.errorName = errorName;
  if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) details.statusCode = statusCode;
  if (SAFE_ERROR_CODES.has(errorCode)) details.errorCode = errorCode;

  return details;
}

export function getSafeDiagnosticUrl(value) {
  try {
    const parsedUrl = new URL(String(value));
    return `${parsedUrl.origin}${parsedUrl.pathname}`.slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Clones JSON-like data while removing credential fields at every nesting level.
 * Payment references such as cardToken are intentionally preserved for server-side recovery.
 */
export function removeSensitiveFields(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => removeSensitiveFields(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return undefined;

  seen.add(value);
  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (isSensitiveFieldName(normalizedKey)) continue;
    const safeValue = removeSensitiveFields(nestedValue, seen);
    if (safeValue !== undefined) sanitized[key] = safeValue;
  }
  seen.delete(value);
  return sanitized;
}
