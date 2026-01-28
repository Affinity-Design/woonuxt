// utils/priceConverter.ts

/**
 * Cleans a raw price string to extract a potentially convertible numeric string.
 * Handles common currency symbols, codes, and HTML entities.
 * @param rawPrice - The raw price string (e.g., "$55.99&nbsp;USD", "CA$ 70.00", "55.99")
 * @returns An object { numericString: string, isUSD: boolean, isCAD: boolean, originalHadSymbol: boolean }
 * numericString will be like "55.99" or empty if not parseable.
 */
export const cleanAndExtractPriceInfo = (
  rawPrice: string | null | undefined,
): {
  numericString: string;
  isUSD: boolean;
  isCAD: boolean;
  originalHadSymbol: boolean;
} => {
  if (rawPrice === null || rawPrice === undefined) {
    return {
      numericString: '',
      isUSD: false,
      isCAD: false,
      originalHadSymbol: false,
    };
  }
  let cleanedStr = String(rawPrice)
    .replace(/&nbsp;/g, ' ')
    .trim();
  const originalHadSymbol = cleanedStr.startsWith('$') || cleanedStr.toUpperCase().startsWith('US$') || cleanedStr.toUpperCase().startsWith('CA$');
  const isUSD = cleanedStr.toUpperCase().includes('USD') || cleanedStr.toUpperCase().startsWith('US$');
  const isCAD = cleanedStr.toUpperCase().includes('CAD') || cleanedStr.toUpperCase().startsWith('CA$');
  cleanedStr = cleanedStr.replace(/US\$/i, '');
  cleanedStr = cleanedStr.replace(/CA\$/i, '');
  cleanedStr = cleanedStr.replace(/\$/g, '');
  cleanedStr = cleanedStr.replace(/\s+(USD|CAD)$/i, '');
  // Remove commas from numbers (e.g., "1,252.99" -> "1252.99")
  cleanedStr = cleanedStr.replace(/,/g, '');
  cleanedStr = cleanedStr.trim();
  // Basic handling for "From " - might need refinement if conversion is needed
  if (cleanedStr.toLowerCase().startsWith('from ')) {
    // For now, treat "From" prices as non-numeric for direct conversion/formatting
    return {numericString: '', isUSD: false, isCAD: false, originalHadSymbol};
  }
  const numericValue = parseFloat(cleanedStr);
  if (isNaN(numericValue)) {
    return {numericString: '', isUSD: false, isCAD: false, originalHadSymbol};
  }
  return {
    numericString: numericValue.toFixed(2),
    isUSD,
    isCAD,
    originalHadSymbol,
  };
};

/**
 * Converts a single raw price string to a CAD numeric string (e.g., "75.99").
 * IMPORTANT: Assumes prices are USD unless explicitly marked as CAD
 */
const convertSinglePriceToCADNumericString = (rawPrice: string | null | undefined, exchangeRate: number): string => {
  const {numericString, isUSD, isCAD} = cleanAndExtractPriceInfo(rawPrice);
  if (numericString === '') return '';
  const numericValue = parseFloat(numericString);

  // If explicitly marked as CAD, return as-is (no conversion needed)
  if (isCAD) {
    return numericValue.toFixed(2);
  }

  // Convert to CAD - assume USD if no currency specified or if explicitly USD
  // This handles WooCommerce cart values that come without currency suffix
  const convertedValue = numericValue * exchangeRate;
  // Round to nearest cent (proper rounding, not the .99 trick for cart totals)
  return convertedValue.toFixed(2);
};

/**
 * Main function to convert a price (single or range) to a CAD numeric string or range string.
 */
export const convertToCAD = (price: string | null | undefined, exchangeRate: number | null): string => {
  if (price === null || price === undefined || exchangeRate === null) return '';
  const priceStr = String(price);
  if (priceStr.includes(' - ')) {
    const [minRawPrice, maxRawPrice] = priceStr.split(' - ');
    const convertedMinNumeric = convertSinglePriceToCADNumericString(minRawPrice, exchangeRate);
    const convertedMaxNumeric = convertSinglePriceToCADNumericString(maxRawPrice, exchangeRate);
    return convertedMinNumeric && convertedMaxNumeric ? `${convertedMinNumeric} - ${convertedMaxNumeric}` : '';
  }
  return convertSinglePriceToCADNumericString(priceStr, exchangeRate);
};

/**
 * Formats a CAD numeric string (e.g., "75.99") into a display string WITHOUT the leading '$'
 * but WITH the trailing ' CAD' (e.g., "75.99 CAD"). Handles ranges.
 * @param cadNumericString - The CAD price as a numeric string, or a range like "75.99 - 85.99".
 * @returns Formatted display string like "75.99 CAD" or "75.99 - 85.99 CAD".
 */
export const formatPriceWithCAD = (cadNumericString: string | null | undefined): string => {
  if (cadNumericString === null || cadNumericString === undefined || cadNumericString === '') return '';

  if (cadNumericString.includes(' - ')) {
    const [minNumeric, maxNumeric] = cadNumericString.split(' - ');
    // Format each part individually (without $) and append CAD only at the end
    const formattedMin = formatSingleNumericPriceWithoutDollar(minNumeric);
    const formattedMax = formatSingleNumericPriceWithoutDollar(maxNumeric);
    // Ensure both parts formatted correctly before combining
    return formattedMin && formattedMax && !formattedMin.includes('NaN') && !formattedMax.includes('NaN')
      ? `${formattedMin} - ${formattedMax} CAD` // Append CAD once for range
      : '';
  }
  // Format single price and append CAD
  return formatSingleNumericPriceWithoutDollar(cadNumericString) + ' CAD';
};

/**
 * Helper: Formats a single numeric string to two decimal places (e.g., "75.99").
 * Returns empty string for 0 or NaN.
 */
const formatSingleNumericPriceWithoutDollar = (numericStr: string): string => {
  const numericAmount = parseFloat(numericStr);
  if (isNaN(numericAmount) || numericAmount === 0) {
    // Return empty string for zero or invalid numbers to avoid "$0.00 CAD" if desired,
    // or return "0.00" if you want zero prices formatted. Let's return empty for now.
    // If you want zero prices like "$0.00 CAD", change formatPriceWithCAD.
    return ''; // Or handle 0 explicitly: if (numericAmount === 0) return "0.00";
  }
  return numericAmount.toFixed(2); // Just the number string "XX.YY"
};

// Other utilities (removeCurrencyPrefix might need adjustment if used elsewhere)
export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return '';
  return price
    .replace(/^(US\$|CA\$|\$)\s*/, '')
    .replace(/\s+(USD|CAD)$/i, '')
    .trim();
};

export const formatZeroPrice = (): string => {
  // This might not be needed if formatPriceWithCAD handles zero appropriately
  return '0.00 CAD'; // Example: without $ prefix
};
