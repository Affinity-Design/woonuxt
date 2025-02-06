// utils/priceConverter.ts
export const convertToCAD = (
  price: string | null,
  exchangeRate: number | null
): string => {
  if (!price || !exchangeRate) return "";

  // Improved price cleaning that handles "US$" prefix and thousand separators
  const cleanedPrice = price
    .replace("US$", "") // Remove US$ prefix first
    .replace(/[^0-9.-]+/g, ""); // Then remove other non-numeric characters

  const usdPrice = parseFloat(cleanedPrice);

  // Handle potential parsing failures
  if (isNaN(usdPrice)) return "";

  const cadPrice = usdPrice * exchangeRate;
  return `CA$${cadPrice.toFixed(2)}`;
};

export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  // Remove both CA$ and US$ prefixes
  return price.replace(/^(CA|US)\$/, "$");
};
