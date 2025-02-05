// utils/priceConverter.ts
export const convertToCAD = (
  price: string | null,
  exchangeRate: number | null
): string => {
  if (!price || !exchangeRate) return "";
  const usdPrice = parseFloat(price.replace(/[^0-9.-]+/g, ""));
  const cadPrice = usdPrice * exchangeRate;
  return `CA$${cadPrice.toFixed(2)}`;
};

export const removeCurrencyPrefix = (price: string | null): string => {
  if (!price) return "";
  return price.replace(/^CA\$/, "$");
};
