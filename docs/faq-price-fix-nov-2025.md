# FAQ Price Display Fix - November 13, 2025

## Issue

FAQs were displaying "$NaN CAD" when product price was null, undefined, or invalid.

## Root Cause

In `composables/useProductRichSnippets.ts`, the `getDefaultFAQs()` function was:

1. Parsing price with `parseFloat(product.price || '0')`
2. Not checking if the result was `NaN`
3. Always including a price FAQ even when price was invalid
4. Passing `NaN` to `formatCADPrice()` which resulted in "$NaN CAD"

## Solution

### Before (Line 315)

```typescript
const price = parseFloat(product.price || '0');

const defaultFAQs = [
  // ... other FAQs
  {
    question: `What is the price of ${productName} in CAD?`,
    answer: `${productName} is priced at ${formatCADPrice(price)} CAD. We display all prices in Canadian dollars for your convenience.`,
  },
];
```

### After (Lines 314-335)

```typescript
// Safely parse price and handle NaN cases
const rawPrice = product.price || product.regularPrice || product.salePrice || '0';
const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
const hasValidPrice = !isNaN(price) && price > 0;

const defaultFAQs = [
  {
    question: `Is ${productName} available in Canada?`,
    answer: `Yes! ${productName} is available for purchase across Canada through ProSkaters Place. We offer fast Canadian shipping with tracking.`,
  },
];

// Only include price FAQ if we have a valid price
if (hasValidPrice) {
  defaultFAQs.push({
    question: `What is the price of ${productName} in CAD?`,
    answer: `${productName} is priced at ${formatCADPrice(price)}. We display all prices in Canadian dollars for your convenience.`,
  });
}

defaultFAQs.push(
  {
    question: `Does ${productName} come with a warranty?`,
    answer: `Yes, ${productName} comes with a manufacturer's warranty. Contact us for specific warranty details and coverage information.`,
  },
  {
    question: `How long does shipping take for ${productName}?`,
    answer: `Standard shipping for ${productName} takes 2-7 business days within Canada. Free shipping is available on orders over $99 CAD.`,
  },
);
```

## Key Improvements

1. **Multiple price sources**: Checks `product.price`, `product.regularPrice`, and `product.salePrice` as fallbacks
2. **String sanitization**: Removes non-numeric characters before parsing with `.replace(/[^0-9.]/g, '')`
3. **NaN validation**: Uses `!isNaN(price) && price > 0` to ensure valid price
4. **Conditional FAQ**: Only adds price FAQ when `hasValidPrice` is true
5. **Cleaner structure**: Warranty and shipping FAQs are always included after price check

## Testing

### Products without price

- ✅ FAQ will skip the price question
- ✅ Other FAQs (availability, warranty, shipping) still display
- ✅ No "$NaN CAD" error

### Products with valid price

- ✅ Price FAQ displays with formatted CAD price
- ✅ All FAQs display normally

### Products with price in various formats

- `"$199.99"` → parsed as `199.99` ✅
- `"199.99 CAD"` → parsed as `199.99` ✅
- `null` → skips price FAQ ✅
- `undefined` → skips price FAQ ✅
- `"0"` → skips price FAQ (price > 0 check) ✅
- `"0.00"` → skips price FAQ ✅

## Impact

- **Product Rich Snippets**: Unaffected (uses separate price handling in `generateProductSchema()`)
- **FAQ Component**: Now gracefully handles missing prices
- **User Experience**: No more confusing "$NaN CAD" text
- **SEO**: FAQs remain valid and useful even without pricing

## Files Modified

- `composables/useProductRichSnippets.ts` - Lines 310-345 (getDefaultFAQs function)

## Notes

- The `useCategoryFAQs.ts` file imports `formatCADPrice` but doesn't actually use it in any FAQs
- Product schema structured data has separate price handling and was not affected by this issue
- This fix only affects the FAQ generation logic, not product pricing display elsewhere

## Verification Steps

1. Find a product with null/undefined price in WooCommerce
2. View the product page
3. Scroll to FAQs section
4. Verify:
   - ✅ No "$NaN CAD" text appears
   - ✅ Price FAQ is not displayed
   - ✅ Other FAQs still appear normally
   - ✅ Page loads without errors

## Related Components

- `components/ProductFAQ.vue` - Displays FAQs (no changes needed)
- `composables/useCanadianSEO.ts` - `formatCADPrice()` function (no changes needed)
- `pages/product/[slug].vue` - Calls `setProductSEO()` with FAQ options (no changes needed)
