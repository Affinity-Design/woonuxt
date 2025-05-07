// utils/priceConverter.ts

/**
 * Cleans a raw price string to extract a potentially convertible numeric string.
 * Handles common currency symbols, codes, and HTML entities.
 * @param rawPrice - The raw price string (e.g., "$55.99&nbsp;USD", "CA$ 70.00", "55.99")
 * @returns An object { numericString: string, isUSD: boolean, isCAD: boolean, originalHadSymbol: boolean }
 * numericString will be like "55.99" or empty if not parseable.
 */
export const cleanAndExtractPriceInfo = (
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
    // This logic might need to be more sophisticated if "From X.XX" needs conversion
    // For now, if "From" is present, we won't consider it a simple numeric string for direct conversion.
    // It might be better to return the "From " part and then try to process the rest.
    // However, cleanAndExtractPriceInfo's primary goal is to get a *number* if possible.
    // Let's assume for now "From" prices are handled differently or not converted here.
    // If you need to convert "From $X.XX", this part needs refinement.
    // For now, parseFloat will fail, and numericString will be "".
  }

  const numericValue = parseFloat(cleanedStr);
  if (isNaN(numericValue)) {
    return { numericString: "", isUSD: false, isCAD: false, originalHadSymbol };
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

  const numericValue = parseFloat(numericString);

  if (isUSD) {
    const convertedValue = numericValue * exchangeRate;
    const dollars = Math.floor(convertedValue); // Your specific rounding
    return (dollars + 0.99).toFixed(2);
  }
  return numericValue.toFixed(2); // Assume already CAD or target currency if not USD
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
    return "";
  }

  if (cadNumericString.includes(" - ")) {
    const [minNumeric, maxNumeric] = cadNumericString.split(" - ");
    const formattedMin = formatSingleNumericPriceWithCAD(minNumeric);
    const formattedMax = formatSingleNumericPriceWithCAD(maxNumeric);
    // Ensure both parts are valid before returning range
    return formattedMin &&
      formattedMax &&
      !formattedMin.includes("NaN") &&
      !formattedMax.includes("NaN")
      ? `${formattedMin} - ${formattedMax}`
      : "";
  }

  return formatSingleNumericPriceWithCAD(cadNumericString);
};

const formatSingleNumericPriceWithCAD = (numericStr: string): string => {
  const numericAmount = parseFloat(numericStr);
  if (isNaN(numericAmount)) {
    // If it's not a number (e.g. "Contact Us"), return the original string.
    // This case should ideally be handled before calling formatPriceWithCAD,
    // as this function expects a numeric string.
    return numericStr;
  }
  if (numericAmount === 0) {
    return "$0.00 CAD";
  }
  return `$${numericAmount.toFixed(2)} CAD`;
};

export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  return price
    .replace(/^(US\$|CA\$|\$)\s*/, "")
    .replace(/\s+(USD|CAD)$/i, "")
    .trim();
};

export const formatZeroPrice = (): string => {
  return "$0.00 CAD";
};
