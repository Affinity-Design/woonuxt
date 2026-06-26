// scripts/build-categories-cache.js
require('dotenv').config();
const fetch = require('node-fetch');
// fs is no longer needed as we don't write the prerender list file here
// const fs = require("fs");
const path = require('path');

// Configuration
const CONFIG = {
  WP_GRAPHQL_URL: process.env.GQL_HOST,
  // Cloudflare API Details (ensure these are set in the build environment)
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
  CF_API_TOKEN: process.env.CF_API_TOKEN,
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID_SCRIPT_DATA, // Specific KV namespace for script data
  KV_KEY_CATEGORIES: 'categories-list', // The key to use in KV for storing categories
  GRAPHQL_RETRY_ATTEMPTS: Number(process.env.GRAPHQL_RETRY_ATTEMPTS || 3),
  GRAPHQL_RETRY_DELAY_MS: Number(process.env.GRAPHQL_RETRY_DELAY_MS || 2000),
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

// GraphQL query for categories (ensure this matches your needs)
const CATEGORIES_QUERY = `
  query getProductCategories($first: Int = 100) {
    productCategories(first: $first, where: { hideEmpty: true }) {
      nodes {
        slug
        databaseId
        name
        description
        count
        image {
          sourceUrl
          altText
        }
        parent {
          node {
            slug
            name
          }
        }
        children {
          nodes {
            slug
            name
            databaseId
          }
        }
      }
    }
  }
`;

// Fetch categories from GraphQL
async function fetchCategories() {
  console.log('Fetching categories from GraphQL for KV store...');
  if (!CONFIG.WP_GRAPHQL_URL) {
    throw new Error('GQL_HOST is not defined. Cannot populate category KV.');
  }

  for (let attempt = 1; attempt <= CONFIG.GRAPHQL_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(CONFIG.WP_GRAPHQL_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query: CATEGORIES_QUERY,
        variables: {first: 500},
      }), // Increased limit potentially
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Could not read error body.');
      const message = `Error fetching categories: ${response.status} ${response.statusText}. Response body: ${errorBody}`;
      if (isRetryableStatus(response.status) && attempt < CONFIG.GRAPHQL_RETRY_ATTEMPTS) {
        console.warn(`${message} Retrying in ${CONFIG.GRAPHQL_RETRY_DELAY_MS}ms (${attempt}/${CONFIG.GRAPHQL_RETRY_ATTEMPTS})...`);
        await delay(CONFIG.GRAPHQL_RETRY_DELAY_MS);
        continue;
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`GraphQL errors while fetching categories: ${JSON.stringify(data.errors)}`);
    }
    if (!data.data || !data.data.productCategories || !data.data.productCategories.nodes) {
      throw new Error(`Unexpected data structure from GraphQL: ${JSON.stringify(data, null, 2)}`);
    }

    const categories = data.data.productCategories.nodes;
    if (categories.length === 0) {
      throw new Error('GraphQL returned 0 categories. Refusing to overwrite category KV with an empty list.');
    }

    console.log(`Fetched ${categories.length} categories.`);
    return categories;
  }

  throw new Error('Category fetch failed after all retry attempts.');
}

// Store categories directly into Cloudflare KV
async function storeCategoriesInKV(categories) {
  console.log(`Storing ${categories.length} categories in Cloudflare KV...`);

  if (!CONFIG.CF_ACCOUNT_ID || !CONFIG.CF_API_TOKEN || !CONFIG.CF_KV_NAMESPACE_ID) {
    console.error('Cloudflare API credentials or KV Namespace ID are not configured. Skipping KV store.');
    console.error('Please set CF_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID_SCRIPT_DATA environment variables.');
    return false;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.CF_ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.CF_KV_NAMESPACE_ID}/values/${CONFIG.KV_KEY_CATEGORIES}`;

  try {
    // Ensure categories is an array before stringifying
    const dataToStore = Array.isArray(categories) ? categories : [];
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${CONFIG.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToStore), // Store the array (or empty array)
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.success) {
      console.error(`Error storing categories in KV: ${response.status} ${response.statusText}`);
      console.error('Cloudflare API response:', responseData);
      return false;
    }

    console.log(`Successfully stored ${dataToStore.length} categories in KV under key "${CONFIG.KV_KEY_CATEGORIES}".`);
    return true;
  } catch (error) {
    console.error(`Error making API call to Cloudflare KV for categories:`, error);
    return false;
  }
}

// Main function
async function main() {
  console.log('Starting category data build process (KV Population Only)...');

  const categories = await fetchCategories();

  const kvSuccess = await storeCategoriesInKV(categories);

  if (!kvSuccess) {
    console.error('Failed to store categories in Cloudflare KV. Exiting.');
    process.exit(1); // Fail build if KV population fails
  }

  console.log('Category KV population process finished successfully.');
}

// Run the main function
main().catch((error) => {
  console.error('Unhandled error in category build main function:', error);
  process.exit(1);
});
