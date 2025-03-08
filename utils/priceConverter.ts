// utils/priceConverter.ts
export const convertToCAD = (
  price: string | null,
  exchangeRate: number | null
): string => {
  if (!price || !exchangeRate) return "";

  // Determine currency type
  const isUSD = price.startsWith("US$");
  const isCAD = price.startsWith("CA$");

  // Clean price by removing currency symbols and non-numeric characters
  const cleanedPrice = price.replace("US$", "").replace("CA$", "");

  const numericPrice = parseFloat(cleanedPrice);
  if (isNaN(numericPrice)) return "";

  let finalValue: number;

  if (isUSD) {
    // Convert USD to CAD
    const convertedPrice = numericPrice * exchangeRate;

    // Round up cents to .99
    const dollars = Math.floor(convertedPrice); // Get the dollar amount
    finalValue = dollars + 0.99; // Add .99 to the dollar amount
  } else if (isCAD) {
    // Keep CAD price as is
    finalValue = numericPrice;
  } else {
    // Invalid currency format
    return "";
  }

  // Format with $ and use helper to ensure consistent prefix removal
  // return `$${finalValue.toFixed(2)}`;
  return finalValue.toFixed(2);
};

export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  // Remove both CA$ and US$ prefixes while preserving existing $
  return price.replace(/^(CA|US)\$/, "$");
};

// Format a dollar amount with the CAD suffix, handling zero values properly
export const formatPriceWithCAD = (amount: number | string): string => {
  if (amount === 0 || amount === "0" || amount === "0.00") {
    return "$0.00 CAD";
  }

  // Convert to a string if it's a number
  const amountStr =
    typeof amount === "number" ? amount.toFixed(2) : amount.toString();

  // If the amount already has a $ prefix, leave it; otherwise add it
  const withDollarSign = amountStr.startsWith("$")
    ? amountStr
    : `$${amountStr}`;

  // Add the CAD suffix with a regular space (not &nbsp;)
  return `${withDollarSign} CAD`;
};

// Utility function specifically for zero values
export const formatZeroPrice = (): string => {
  return "$0.00 CAD";
};
