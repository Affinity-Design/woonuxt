// scripts/build-products-cache.js
require('dotenv').config();
const fetch = require('node-fetch');

// Check if running in build mode with product limit
const isBuildMode = process.argv.includes('--build-mode') || process.env.LIMIT_PRODUCTS === 'true';

const maxProducts = isBuildMode ? parseInt(process.env.MAX_PRODUCTS || '2000', 10) : null;

// --- Store Currency Configuration ---
// If WooCommerce store is already set to CAD, skip conversion to avoid double conversion
// Set WOOCOMMERCE_CURRENCY=CAD in environment to skip USD->CAD conversion
const STORE_CURRENCY = (process.env.WOOCOMMERCE_CURRENCY || 'USD').toUpperCase();
const SKIP_CONVERSION = STORE_CURRENCY === 'CAD';

if (SKIP_CONVERSION) {
  console.log('📢 WOOCOMMERCE_CURRENCY=CAD detected - Skipping USD to CAD conversion (prices already in CAD)');
}

// --- Get Build-Time Exchange Rate ---
let BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD = parseFloat(process.env.NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE);
if (isNaN(BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD) || BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD <= 0) {
  console.warn(
    'WARNING: NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE is not a valid positive number. Prices will not be converted to CAD in the build script.',
    `Current value: ${process.env.NUXT_PUBLIC_BUILD_TIME_EXCHANGE_RATE}`,
  );
  // To prevent downstream errors, if rate is invalid, set it to a value that signifies no conversion (or handle differently)
  BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD = 0; // Or 1, or handle by exiting. 0 will skip conversion block.
}

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  BATCH_SIZE: 10,
  BATCH_DELAY: 500,
  IS_BUILD_MODE: isBuildMode,
  MAX_PRODUCTS: maxProducts,
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA,
  KV_KEY_PRODUCTS: 'products-list',
};

// GraphQL query (ensure it's correct and matches your backend schema)
const PRODUCTS_QUERY = `
query GetProductsForSearch($first: Int!, $after: String, $orderby: ProductsOrderByEnum = DATE, $order: OrderEnum = DESC) {
  products(first: $first, after: $after, where: {orderby: {field: $orderby, order: $order}}) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      databaseId
      name
      slug
      sku
      shortDescription
      productCategories {
        nodes {
          name
          slug
        }
      }
      ... on SimpleProduct {
        price(format: RAW)
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
        image {
          sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
          altText
          title
        }
      }
      ... on VariableProduct {
        price(format: RAW)
        regularPrice(format: RAW)
        salePrice(format: RAW)
        stockStatus
        onSale
        manageStock
        stockQuantity
        image {
          sourceUrl(size: WOOCOMMERCE_THUMBNAIL)
          altText
          title
        }
      }
    }
  }
}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Converts USD price to CAD with .99 rounding.
 * IMPORTANT: Skips conversion if price is already marked as CAD.
 * This matches the logic in utils/priceConverter.ts
 */
function convertUsdToCadWithRounding(priceString, exchangeRate) {
  if (priceString === null || priceString === undefined || typeof priceString !== 'string' || priceString.trim() === '') {
    return null;
  }

  let priceToConvert = priceString.trim();

  // Check if price is already marked as CAD - if so, skip conversion
  const isCAD = priceToConvert.toUpperCase().includes('CAD') || priceToConvert.toUpperCase().startsWith('CA$');

  // Clean the price string for numeric extraction
  if (priceToConvert.includes(',')) {
    priceToConvert = priceToConvert.split(',')[0].trim();
  }
  priceToConvert = priceToConvert.replace(/[^0-9.-]+/g, '');
  const numericPrice = parseFloat(priceToConvert);

  if (isNaN(numericPrice)) {
    return null;
  }

  // If price is already CAD, return as-is (no conversion needed)
  // This prevents double-conversion when WooCommerce sends CAD prices
  if (isCAD) {
    console.log(`[Build] Price already CAD, skipping conversion: ${priceString} -> ${numericPrice.toFixed(2)}`);
    // Still apply .99 rounding for consistency
    const dollars = Math.floor(numericPrice);
    return (dollars + 0.99).toFixed(2);
  }

  // If exchangeRate is invalid (e.g., 0 or NaN), return original price
  if (isNaN(exchangeRate) || exchangeRate <= 0) {
    return numericPrice.toFixed(2);
  }

  // Convert USD to CAD with .99 rounding
  const convertedValue = numericPrice * exchangeRate;
  const dollars = Math.floor(convertedValue);
  const finalCadValue = dollars + 0.99;
  return finalCadValue.toFixed(2);
}

async function fetchAndProcessProducts() {
  console.log(`Starting to fetch products from GraphQL${CONFIG.IS_BUILD_MODE ? ' (BUILD MODE - LIMITED)' : ''}...`);
  let allProducts = [];
  let hasNextPage = true;
  let endCursor = null;
  let batchCount = 0;

  if (!CONFIG.WP_GRAPHQL_URL) {
    console.error('GQL_HOST is not defined in environment variables. Skipping product fetch.');
    return [];
  }

  while (hasNextPage) {
    batchCount++;
    console.log(`Fetching product batch ${batchCount}, cursor: ${endCursor || 'Start'}`);
    if (CONFIG.IS_BUILD_MODE && CONFIG.MAX_PRODUCTS !== null && allProducts.length >= CONFIG.MAX_PRODUCTS) {
      console.log(`Reached build mode limit of ${CONFIG.MAX_PRODUCTS}. Stopping fetch.`);
      break;
    }

    try {
      const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: CONFIG.BATCH_SIZE,
            after: endCursor,
            orderby: 'DATE',
            order: 'DESC',
          },
        }),
      });

      // --- START: Robust Error Handling for GraphQL Response ---
      if (!response.ok) {
        console.error(`GraphQL API request failed: ${response.status} ${response.statusText}`);
        try {
          const errorBody = await response.text();
          console.error('Response body:', errorBody);
        } catch (e) {
          console.error('Could not read error response body.');
        }
        break; // Stop fetching on HTTP error
      }

      const result = await response.json();

      if (result.errors) {
        console.error('GraphQL query returned errors:', JSON.stringify(result.errors, null, 2));
        // Depending on the error, you might want to break or continue
        // For critical errors, it's often best to break.
        break; // Stop fetching if GraphQL reports errors
      }

      if (!result.data) {
        console.error("GraphQL response missing 'data' field. Response:", JSON.stringify(result, null, 2));
        break; // Stop if 'data' field is missing
      }
      // The line that caused the error:
      // Ensure result.data.products and result.data.products.nodes exist
      if (!result.data.products || !result.data.products.nodes) {
        console.error("GraphQL response 'data' field does not contain 'products.nodes'. Response data:", JSON.stringify(result.data, null, 2));
        // It's possible there are no products, which is valid. Check pageInfo.
        if (result.data.products && result.data.products.pageInfo) {
          hasNextPage = result.data.products.pageInfo.hasNextPage;
          endCursor = result.data.products.pageInfo.endCursor;
          if (!hasNextPage) console.log('No more products to fetch according to pageInfo.');
          // Continue to next iteration or break if desired
          if (hasNextPage && CONFIG.BATCH_DELAY > 0) await delay(CONFIG.BATCH_DELAY);
          continue; // Skip processing this empty batch and try next if hasNextPage
        } else {
          break; // If pageInfo is also missing, it's an unexpected structure
        }
      }
      // --- END: Robust Error Handling ---

      const fetchedNodes = result.data.products.nodes || []; // Default to empty array if nodes is null/undefined

      const productsWithCadPrices = fetchedNodes.map((product) => {
        const convertedProduct = {...product};

        // If WooCommerce store currency is CAD, prices are already in CAD - just format with marker
        if (SKIP_CONVERSION) {
          // Store currency is CAD - just add the CAD marker for ProductPrice component, apply .99 rounding
          if (convertedProduct.price !== undefined && convertedProduct.price !== null) {
            const numPrice = parseFloat(String(convertedProduct.price).replace(/[^0-9.-]/g, ''));
            if (!isNaN(numPrice)) {
              const dollars = Math.floor(numPrice);
              convertedProduct.price = `${(dollars + 0.99).toFixed(2)} CAD`;
            }
          }
          if (convertedProduct.regularPrice !== undefined && convertedProduct.regularPrice !== null) {
            const numPrice = parseFloat(String(convertedProduct.regularPrice).replace(/[^0-9.-]/g, ''));
            if (!isNaN(numPrice)) {
              const dollars = Math.floor(numPrice);
              convertedProduct.regularPrice = `${(dollars + 0.99).toFixed(2)} CAD`;
            }
          }
          if (convertedProduct.salePrice !== undefined && convertedProduct.salePrice !== null) {
            const numPrice = parseFloat(String(convertedProduct.salePrice).replace(/[^0-9.-]/g, ''));
            if (!isNaN(numPrice)) {
              const dollars = Math.floor(numPrice);
              convertedProduct.salePrice = `${(dollars + 0.99).toFixed(2)} CAD`;
            }
          }
        } else if (BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD > 0) {
          // Store currency is USD - convert to CAD and add marker
          if (convertedProduct.price !== undefined && convertedProduct.price !== null) {
            const converted = convertUsdToCadWithRounding(convertedProduct.price, BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD);
            convertedProduct.price = converted ? `${converted} CAD` : null;
          }
          if (convertedProduct.regularPrice !== undefined && convertedProduct.regularPrice !== null) {
            const converted = convertUsdToCadWithRounding(convertedProduct.regularPrice, BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD);
            convertedProduct.regularPrice = converted ? `${converted} CAD` : null;
          }
          if (convertedProduct.salePrice !== undefined && convertedProduct.salePrice !== null) {
            const converted = convertUsdToCadWithRounding(convertedProduct.salePrice, BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD);
            convertedProduct.salePrice = converted ? `${converted} CAD` : null;
          }
        }

        convertedProduct.price = convertedProduct.price === undefined ? null : convertedProduct.price;
        convertedProduct.regularPrice = convertedProduct.regularPrice === undefined ? null : convertedProduct.regularPrice;
        convertedProduct.salePrice = convertedProduct.salePrice === undefined ? null : convertedProduct.salePrice;
        return convertedProduct;
      });

      if (CONFIG.IS_BUILD_MODE && CONFIG.MAX_PRODUCTS !== null && allProducts.length + productsWithCadPrices.length > CONFIG.MAX_PRODUCTS) {
        const limit = CONFIG.MAX_PRODUCTS - allProducts.length;
        allProducts.push(...productsWithCadPrices.slice(0, limit));
        console.log(`Fetched and converted ${limit} products (hit limit). Total: ${allProducts.length}.`);
        hasNextPage = false;
      } else {
        allProducts.push(...productsWithCadPrices);
        console.log(`Fetched and converted ${productsWithCadPrices.length} products. Total: ${allProducts.length}.`);
      }

      if (hasNextPage) {
        // Check if we should continue based on previous logic
        hasNextPage = result.data.products.pageInfo.hasNextPage;
        endCursor = result.data.products.pageInfo.endCursor;
      }
      if (hasNextPage && CONFIG.BATCH_DELAY > 0) await delay(CONFIG.BATCH_DELAY);
    } catch (error) {
      console.error('Error during product fetch/process operation (inside try-catch):', error);
      // Log the raw response if available and the error is from parsing
      if (error.type === 'invalid-json' && error.response) {
        try {
          const text = await error.response.text();
          console.error('Failed to parse JSON, raw response text:', text.substring(0, 500) + '...');
        } catch (textError) {
          console.error('Could not get raw text from error response.');
        }
      }
      break; // Stop fetching on error
    }
  }
  console.log(`Finished fetching & processing products. Total collected: ${allProducts.length}`);
  return allProducts;
}

async function storeProductsInKV(products) {
  console.log(`Storing ${products.length} products (with CAD prices) in Cloudflare KV...`);
  if (!CONFIG.CF_ACCOUNT_ID || !CONFIG.CF_API_TOKEN || !CONFIG.CF_KV_NAMESPACE_ID) {
    console.error('Cloudflare API credentials for KV not configured. Skipping KV store.');
    return false;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_PRODUCTS}`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(products),
    });
    const responseData = await response.json();
    if (!response.ok || !responseData.success) {
      console.error(`Error storing products in KV: ${response.status} ${response.statusText}`, responseData);
      return false;
    }
    console.log(`Successfully stored ${products.length} products in KV.`);
    return true;
  } catch (e) {
    console.error('Error making API call to Cloudflare KV:', e);
    return false;
  }
}

async function main() {
  console.log(`Starting products data build process${CONFIG.IS_BUILD_MODE ? ' (BUILD MODE)' : ''}...`);
  if (BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD <= 0) {
    // Check against 0 or NaN (already handled for NaN)
    console.warn('Build-time exchange rate is invalid or not set. Prices will be stored as fetched (assumed USD).');
  } else {
    console.log(`Using build-time USD to CAD exchange rate: ${BUILD_TIME_EXCHANGE_RATE_USD_TO_CAD}`);
  }

  const products = await fetchAndProcessProducts();

  if (!products || products.length === 0) {
    console.warn('No products fetched/processed. Storing empty list in KV.');
    await storeProductsInKV([]);
  } else {
    const success = await storeProductsInKV(products);
    if (!success) {
      console.error('Failed to store products in Cloudflare KV.');
      process.exit(1);
    }
  }
  console.log('Products data build process finished.');
}

main().catch((error) => {
  console.error('Unhandled error in products build main function:', error);
  process.exit(1);
});
