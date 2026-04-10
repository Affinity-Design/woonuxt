import {cleanAndExtractPriceInfo, convertToCAD, formatPriceWithCAD} from '~/utils/priceConverter';

const roundToCents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const parseMoneyNumber = (price: string | number | null | undefined): number => {
  if (typeof price === 'number') return Number.isFinite(price) ? price : 0;
  if (price === null || price === undefined) return 0;

  let stringValue = String(price);
  stringValue = stringValue.replace(/<[^>]*>/g, '');
  stringValue = stringValue.replace(/&#36;/g, '$');
  stringValue = stringValue.replace(/&nbsp;/g, ' ');
  stringValue = stringValue.replace(/,/g, '');
  stringValue = stringValue.replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(stringValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const convertToCadNumber = (price: string | null | undefined, exchangeRate: number | null, roundTo99 = false): number => {
  if (!price || String(price).trim() === '') return 0;

  if (exchangeRate !== null) {
    const cadNumericString = convertToCAD(price, exchangeRate, roundTo99);
    if (cadNumericString) {
      const parsedCad = parseFloat(cadNumericString);
      if (Number.isFinite(parsedCad)) return roundToCents(parsedCad);
    }
  }

  const {numericString} = cleanAndExtractPriceInfo(price);
  return roundToCents(parseFloat(numericString || '0') || 0);
};

const getPreferredAdvertisedPriceSource = (node: any): string | null => {
  if (!node) return null;

  const salePrice = node.salePrice;
  const regularPrice = node.regularPrice;
  const defaultPrice = node.price;

  if (salePrice && regularPrice && salePrice !== regularPrice) return salePrice;
  return regularPrice || defaultPrice || salePrice || null;
};

export const formatCadDisplay = (amount: number): string => {
  if (amount <= 0) return '0.00 CAD';
  return formatPriceWithCAD(roundToCents(amount).toFixed(2));
};

export const formatCadCurrency = (amount: number): string => `$${formatCadDisplay(amount)}`;

export const formatAdvertisedCadPrice = (price: string | null | undefined, exchangeRate: number | null): string => {
  const cadAmount = convertToCadNumber(price, exchangeRate, true);
  return cadAmount > 0 ? formatCadDisplay(cadAmount) : '';
};

export const getAdvertisedUnitPrice = (node: any, exchangeRate: number | null): number => {
  const preferredPrice = getPreferredAdvertisedPriceSource(node);
  return preferredPrice ? convertToCadNumber(preferredPrice, exchangeRate, true) : 0;
};

export interface LifecycleLinePricing {
  itemKey: string;
  quantity: number;
  advertisedUnitPrice: number;
  advertisedSubtotal: number;
  netTotal: number;
  discountAmount: number;
}

const calculateBaseLifecycleLinePricing = (item: any, exchangeRate: number | null): LifecycleLinePricing => {
  const node = item?.variation?.node || item?.product?.node || item;
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  const advertisedUnitPrice = getAdvertisedUnitPrice(node, exchangeRate);
  const advertisedSubtotal = roundToCents(advertisedUnitPrice * quantity);

  const exactSubtotal = parseMoneyNumber(item?.subtotal);
  const exactTax = parseMoneyNumber(item?.tax);
  const exactTotal = parseMoneyNumber(item?.total);

  let exactNetTotal = exactSubtotal;
  if (exactTotal > 0) {
    exactNetTotal = exactTotal > exactSubtotal && exactTax > 0 ? Math.max(0, exactTotal - exactTax) : exactTotal;
  }

  const effectiveDiscountFactor = exactSubtotal > 0 ? Math.min(1, Math.max(0, exactNetTotal / exactSubtotal)) : 1;
  const netTotal = roundToCents(advertisedSubtotal * effectiveDiscountFactor);
  const discountAmount = roundToCents(Math.max(0, advertisedSubtotal - netTotal));

  return {
    itemKey: item?.key || '',
    quantity,
    advertisedUnitPrice,
    advertisedSubtotal,
    netTotal,
    discountAmount,
  };
};

const normalizeDiscountAcrossLines = (lines: LifecycleLinePricing[], targetDiscount: number): LifecycleLinePricing[] => {
  const subtotal = roundToCents(lines.reduce((sum, line) => sum + line.advertisedSubtotal, 0));
  if (subtotal <= 0 || targetDiscount <= 0) return lines;

  const clampedDiscount = Math.min(targetDiscount, subtotal);
  const targetNetTotal = roundToCents(subtotal - clampedDiscount);
  const multiplier = subtotal > 0 ? targetNetTotal / subtotal : 1;

  const normalizedLines = lines.map((line) => {
    const netTotal = roundToCents(line.advertisedSubtotal * multiplier);
    return {
      ...line,
      netTotal,
      discountAmount: roundToCents(Math.max(0, line.advertisedSubtotal - netTotal)),
    };
  });

  const normalizedNetTotal = roundToCents(normalizedLines.reduce((sum, line) => sum + line.netTotal, 0));
  const remainder = roundToCents(targetNetTotal - normalizedNetTotal);

  if (normalizedLines.length > 0 && remainder !== 0) {
    const lastLine = normalizedLines[normalizedLines.length - 1];
    const adjustedNetTotal = roundToCents(Math.max(0, lastLine.netTotal + remainder));
    normalizedLines[normalizedLines.length - 1] = {
      ...lastLine,
      netTotal: adjustedNetTotal,
      discountAmount: roundToCents(Math.max(0, lastLine.advertisedSubtotal - adjustedNetTotal)),
    };
  }

  return normalizedLines;
};

export interface LifecycleCartPricing {
  lines: LifecycleLinePricing[];
  subtotal: number;
  netMerchandiseTotal: number;
  discount: number;
  tax: number;
  shipping: number;
  totalWithoutShipping: number;
  total: number;
}

export const calculateLifecycleCartPricing = (cart: any, exchangeRate: number | null): LifecycleCartPricing => {
  const baseLines = (cart?.contents?.nodes || []).map((item: any) => calculateBaseLifecycleLinePricing(item, exchangeRate));
  const baseDiscount = roundToCents(baseLines.reduce((sum, line) => sum + line.discountAmount, 0));
  const exactCartDiscount = convertToCadNumber(cart?.discountTotal, exchangeRate);

  const lines = exactCartDiscount > 0 && Math.abs(exactCartDiscount - baseDiscount) > 0.01 ? normalizeDiscountAcrossLines(baseLines, exactCartDiscount) : baseLines;

  const subtotal = roundToCents(lines.reduce((sum, line) => sum + line.advertisedSubtotal, 0));
  const netMerchandiseTotal = roundToCents(lines.reduce((sum, line) => sum + line.netTotal, 0));
  const discount = roundToCents(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const tax = convertToCadNumber(cart?.totalTax, exchangeRate);
  const shipping = convertToCadNumber(cart?.shippingTotal, exchangeRate);
  const totalWithoutShipping = roundToCents(netMerchandiseTotal + tax);
  const total = roundToCents(totalWithoutShipping + shipping);

  return {
    lines,
    subtotal,
    netMerchandiseTotal,
    discount,
    tax,
    shipping,
    totalWithoutShipping,
    total,
  };
};