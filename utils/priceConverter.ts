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
  const cleanedPrice = price
    .replace("US$", "")
    .replace("CA$", "")
    .replace(/[^0-9.-]/g, "");

  const numericPrice = parseFloat(cleanedPrice);
  if (isNaN(numericPrice)) return "";

  // Convert only USD prices
  const finalValue = isUSD ? numericPrice * exchangeRate : numericPrice;

  // Format with $ and use helper to ensure consistent prefix removal
  return removeCurrencyPrefix(`$${finalValue.toFixed(2)}`);
};

export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  // Remove both CA$ and US$ prefixes while preserving existing $
  return price.replace(/^(CA|US)\$/, "$");
};
