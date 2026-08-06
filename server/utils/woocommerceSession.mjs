export function normalizeWooCommerceSessionToken(headerValue) {
  if (typeof headerValue !== 'string') return null;

  const normalizedToken = headerValue
    .trim()
    .replace(/^Session\s+/i, '')
    .trim();
  return normalizedToken || null;
}
