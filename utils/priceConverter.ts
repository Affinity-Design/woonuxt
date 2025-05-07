// utils/priceConverter.ts

/**
 * Cleans a raw price string to extract a potentially convertible numeric string.
 * Handles common currency symbols, codes, and HTML entities.
 * @param rawPrice - The raw price string (e.g., "$55.99&nbsp;USD", "CA$ 70.00", "55.99")
 * @returns An object { numericString: string, isUSD: boolean, isCAD: boolean }
 * numericString will be like "55.99" or empty if not parseable.
 */
const cleanAndExtractPriceInfo = (
  rawPrice: string | null | undefined
): {
  numericString: string;
  isUSD: boolean;
  isCAD: boolean;
  originalHadSymbol: boolean;
} => {
  if (rawPrice === null || rawPrice === undefined) {
    return {
      numericString: "",
      isUSD: false,
      isCAD: false,
      originalHadSymbol: false,
    };
  }

  let cleanedStr = String(rawPrice)
    .replace(/&nbsp;/g, " ")
    .trim();

  const originalHadSymbol =
    cleanedStr.startsWith("$") ||
    cleanedStr.toUpperCase().startsWith("US$") ||
    cleanedStr.toUpperCase().startsWith("CA$");

  const isUSD =
    cleanedStr.toUpperCase().includes("USD") ||
    cleanedStr.toUpperCase().startsWith("US$");
  const isCAD =
    cleanedStr.toUpperCase().includes("CAD") ||
    cleanedStr.toUpperCase().startsWith("CA$"); // Explicitly CAD

  // Remove currency symbols and codes to get to the number
  cleanedStr = cleanedStr.replace(/US\$/i, "");
  cleanedStr = cleanedStr.replace(/CA\$/i, "");
  cleanedStr = cleanedStr.replace(/\$/g, ""); // Remove all dollar signs
  cleanedStr = cleanedStr.replace(/\s+(USD|CAD)$/i, ""); // Remove trailing codes
  cleanedStr = cleanedStr.trim();

  // Handle potential "From " prefix if it's still there after symbol removal
  if (cleanedStr.toLowerCase().startsWith("from ")) {
    // For "From X.XX" type strings, we might not want to treat them as simple numerics here
    // Or, decide to parse out the number after "From ". For now, let's assume these are not directly convertible.
    // This part might need adjustment based on how "From" prices should be handled by conversion.
    // If "From" prices should also be converted, then:
    // cleanedStr = cleanedStr.substring(5).trim(); // "From ".length is 5
  }

  // Attempt to parse, but primarily return the cleaned string if it looks numeric
  const numericValue = parseFloat(cleanedStr);
  if (isNaN(numericValue)) {
    // If it's not a number after all that cleaning, it might be a string like "Contact us"
    // or was a "From" string we didn't parse further.
    return { numericString: "", isUSD: false, isCAD: false, originalHadSymbol }; // Return empty if not clearly numeric
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
 * @param rawPrice - The raw price string.
 * @param exchangeRate - The USD to CAD exchange rate.
 * @returns CAD price as a string (e.g., "75.99"), or empty string if conversion fails.
 */
const convertSinglePriceToCADNumericString = (
  rawPrice: string | null | undefined,
  exchangeRate: number
): string => {
  const { numericString, isUSD } = cleanAndExtractPriceInfo(rawPrice);

  if (numericString === "") {
    return ""; // Cannot convert if no valid numeric string
  }

  const numericValue = parseFloat(numericString); // Should be safe due to previous check

  if (isUSD) {
    const convertedValue = numericValue * exchangeRate;
    const dollars = Math.floor(convertedValue); // Your specific rounding
    return (dollars + 0.99).toFixed(2);
  }
  // If not USD, assume it's already in the target currency (CAD for this function's purpose)
  // or doesn't need currency conversion based on your data.
  return numericValue.toFixed(2);
};

/**
 * Main function to convert a price (single or range) to a CAD numeric string or range string.
 * @param price - The raw price string, possibly a range.
 * @param exchangeRate - The USD to CAD exchange rate.
 * @returns Converted CAD price(s) as a string (e.g., "75.99" or "75.99 - 85.99"), or empty string.
 */
export const convertToCAD = (
  price: string | null | undefined,
  exchangeRate: number | null
): string => {
  if (price === null || price === undefined || exchangeRate === null) {
    return "";
  }

  const priceStr = String(price);

  if (priceStr.includes(" - ")) {
    const [minRawPrice, maxRawPrice] = priceStr.split(" - ");
    const convertedMinNumeric = convertSinglePriceToCADNumericString(
      minRawPrice,
      exchangeRate
    );
    const convertedMaxNumeric = convertSinglePriceToCADNumericString(
      maxRawPrice,
      exchangeRate
    );
    return convertedMinNumeric && convertedMaxNumeric
      ? `${convertedMinNumeric} - ${convertedMaxNumeric}`
      : "";
  }

  return convertSinglePriceToCADNumericString(priceStr, exchangeRate);
};

/**
 * Formats a CAD numeric string (e.g., "75.99") into a display string (e.g., "$75.99 CAD").
 * Also handles ranges if the input numeric string is a range.
 * @param cadNumericString - The CAD price as a numeric string, or a range like "75.99 - 85.99".
 * @returns Formatted display string.
 */
export const formatPriceWithCAD = (
  cadNumericString: string | null | undefined
): string => {
  if (
    cadNumericString === null ||
    cadNumericString === undefined ||
    cadNumericString === ""
  ) {
    return ""; // Or a placeholder like "Price unavailable"
  }

  if (cadNumericString.includes(" - ")) {
    const [minNumeric, maxNumeric] = cadNumericString.split(" - ");
    const formattedMin = formatSingleNumericPriceWithCAD(minNumeric);
    const formattedMax = formatSingleNumericPriceWithCAD(maxNumeric);
    return formattedMin && formattedMax
      ? `${formattedMin} - ${formattedMax}`
      : "";
  }

  return formatSingleNumericPriceWithCAD(cadNumericString);
};

const formatSingleNumericPriceWithCAD = (numericStr: string): string => {
  const numericAmount = parseFloat(numericStr);
  if (isNaN(numericAmount)) {
    return numericStr; // Return original if not parseable (e.g. "Contact Us")
  }
  if (numericAmount === 0) {
    return "$0.00 CAD";
  }
  return `$${numericAmount.toFixed(2)} CAD`;
};

// This utility might be less needed if the main pipeline is robust.
export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  // Simplified: primary cleaning should happen in cleanAndExtractPriceInfo
  return price
    .replace(/^(US\$|CA\$|\$)\s*/, "")
    .replace(/\s+(USD|CAD)$/i, "")
    .trim();
};

export const formatZeroPrice = (): string => {
  return "$0.00 CAD";
};
