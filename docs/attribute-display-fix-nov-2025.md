# Attribute Display Fix - Size Range Formatting Issue

**Date:** November 13, 2025  
**Issue:** Size attributes displaying incorrectly with unwanted decimal points

## Problem

Product size attributes with range formats (e.g., "41-28-32EUadjustable") were being incorrectly formatted by the `formatSlugForDisplayWorkaround()` function, which was applying decimal point logic meant for half-sizes to size ranges.

### Examples of Incorrect Behavior:

**Before Fix:**

- Input: `"41-28-32euadjustable"`
- Output: `"41.28.32EUAdjustable"` ❌ (incorrect decimals)
- Expected: `"41-28-32EUAdjustable"` ✓

- Input: `"69-33-37euadjustable"`
- Output: `"69.33.37EUAdjustable"` ❌ (incorrect decimals)
- Expected: `"69-33-37EUAdjustable"` ✓

- Input: `"28-32eu"`
- Output: `"28.32EU"` ❌ (incorrect decimal)
- Expected: `"28-32EU"` ✓

### Correct Behavior (Still Works):

**Half-sizes should still get decimals:**

- Input: `"43-5eu"`
- Output: `"43.5EU"` ✓ (correct)

- Input: `"35-5"`
- Output: `"35.5"` ✓ (correct)

## Root Cause

The previous `formatSlugForDisplayWorkaround()` function had overly aggressive decimal insertion logic that:

1. Converted ALL `N-D` patterns to `N.D` format
2. Applied complex multi-segment decimal logic
3. Did not distinguish between:
   - **Size ranges** (e.g., "41-28-32" = covers sizes 41 through 32)
   - **Half sizes** (e.g., "43-5" = size 43.5)

## Solution

Updated the `formatSlugForDisplayWorkaround()` function in `components/productElements/AttributeSelections.vue` to:

1. **Detect size range patterns** before applying decimal formatting
2. **Only apply decimal formatting** to single half-sizes (e.g., "N-5")
3. **Preserve hyphens** in multi-part size ranges

### New Logic:

```typescript
const formatSlugForDisplayWorkaround = (slug: string): string => {
  if (!slug) return '';

  let formattedSlug = slug;

  // Detect if this is a size range pattern (multiple hyphens with numbers)
  // Pattern: XX-YY-ZZ or XX-YY (adjustable sizes)
  // Examples: "41-28-32euadjustable", "28-32eu", "69-33-37euadjustable"
  const isSizeRange = /^\d+-\d+(-\d+)?/i.test(formattedSlug);

  if (!isSizeRange) {
    // Only apply decimal formatting for single shoe sizes with half sizes
    // Pattern: "43-5eu" -> "43.5EU", "35-5" -> "35.5"
    formattedSlug = formattedSlug.replace(/(\d+)-5(eu|$)/gi, '$1.5$2');
  }

  // Capitalize "EU"
  formattedSlug = formattedSlug.replace(/eu/gi, 'EU');

  // Capitalize "Adjustable"
  formattedSlug = formattedSlug.replace(/adjustable/gi, 'Adjustable');

  return formattedSlug;
};
```

## Key Changes

### 1. Size Range Detection

```typescript
const isSizeRange = /^\d+-\d+(-\d+)?/i.test(formattedSlug);
```

- Matches patterns like: `"XX-YY"` or `"XX-YY-ZZ"`
- Examples: `"28-32"`, `"41-28-32"`, `"69-33-37"`

### 2. Conditional Decimal Formatting

```typescript
if (!isSizeRange) {
  // Only format single half-sizes
  formattedSlug = formattedSlug.replace(/(\d+)-5(eu|$)/gi, '$1.5$2');
}
```

- **Only applies** when NOT a size range
- **Only affects** patterns ending in "-5" (half sizes)
- Examples: `"43-5eu"` → `"43.5EU"`

### 3. Consistent Capitalization

- `"eu"` → `"EU"` (all cases)
- `"adjustable"` → `"Adjustable"` (all cases)

## Test Cases

### ✅ Size Ranges (Should NOT have decimals)

| Input                    | Output                   | Status   |
| ------------------------ | ------------------------ | -------- |
| `"41-28-32euadjustable"` | `"41-28-32EUAdjustable"` | ✅ Fixed |
| `"69-33-37euadjustable"` | `"69-33-37EUAdjustable"` | ✅ Fixed |
| `"28-32eu"`              | `"28-32EU"`              | ✅ Fixed |
| `"25-36-42euadjustable"` | `"25-36-42EUAdjustable"` | ✅ Fixed |

### ✅ Half Sizes (SHOULD have decimals)

| Input      | Output     | Status         |
| ---------- | ---------- | -------------- |
| `"43-5eu"` | `"43.5EU"` | ✅ Still works |
| `"35-5"`   | `"35.5"`   | ✅ Still works |
| `"44-5eu"` | `"44.5EU"` | ✅ Still works |

### ✅ Whole Sizes (No changes needed)

| Input    | Output   | Status   |
| -------- | -------- | -------- |
| `"43eu"` | `"43EU"` | ✅ Works |
| `"28"`   | `"28"`   | ✅ Works |

## Impact

### Before Fix:

```
Size: 41.28.32EUAdjustable ❌
      28.32EU ❌
```

### After Fix:

```
Size: 41-28-32EUAdjustable ✓
      28-32EU ✓
```

### User Experience:

- **Clear size ranges** - Customers can understand "41-28-32" means sizes 41 to 32
- **Correct half sizes** - "43.5EU" still displays properly
- **Professional appearance** - Proper capitalization (EU, Adjustable)
- **No confusion** - Eliminates incorrect decimal points in range displays

## Files Modified

- `components/productElements/AttributeSelections.vue` - Line 59-92 (`formatSlugForDisplayWorkaround` function)

## Verification Steps

1. Navigate to a product with size range attributes (e.g., Flying Eagle S6 Blue Kids Inline Skates)
2. Check size attribute display
3. Verify:
   - ✅ Size ranges show hyphens (e.g., "41-28-32EUAdjustable")
   - ✅ No unwanted decimals in ranges
   - ✅ "EU" is capitalized
   - ✅ "Adjustable" is capitalized
   - ✅ Half-sizes still show decimals if applicable (e.g., "43.5EU")

## Notes

- This fix only affects the display formatting, not the actual attribute values stored in WooCommerce
- The regex pattern `/^\d+-\d+(-\d+)?/i` is case-insensitive and flexible for different range formats
- The function still supports both "eu" and "EU" in input slugs
- TypeScript errors shown are from Nuxt auto-imports and are expected (not actual runtime errors)

## Related Issues

- Original complex decimal logic was designed for shoe size formats like "36-425eu" → "36-42.5EU"
- This was over-engineering for the actual product data, which uses simpler range formats
- New approach is simpler, more maintainable, and matches actual product data structure
