const GOOGLE_SHIPPING_WEIGHT_UNITS = new Set(['g', 'kg', 'oz', 'lb']);

/**
 * Format WooCommerce's numeric product weight for Google Merchant Center.
 * Woo stores the unit globally, so callers must pass the store's configured
 * unit when it differs from the Canadian catalogue's kilogram default.
 */
function normalizeShippingWeight(rawWeight, unit = 'kg') {
  const normalizedUnit = String(unit).trim().toLowerCase();
  if (!GOOGLE_SHIPPING_WEIGHT_UNITS.has(normalizedUnit)) {
    throw new Error(`unsupported Google shipping weight unit "${unit}"`);
  }

  const numericWeight = Number(String(rawWeight ?? '').trim());
  if (!Number.isFinite(numericWeight) || numericWeight <= 0) return undefined;

  return `${numericWeight} ${normalizedUnit}`;
}

module.exports = {normalizeShippingWeight};
