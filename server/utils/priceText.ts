// server/utils/priceText.ts
//
// WooCommerce formats price strings as HTML (e.g. "$2.25&nbsp;CAD"). We persist those strings
// verbatim as human-readable order meta (_cart_* keys) and in stranded-charge records, so the raw
// entity leaks into wp-admin and support tooling. Decode to plain text before persisting.
// Numeric amounts are unaffected — they go through parseCADPrice, not this.
export function cleanPriceText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value)
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
