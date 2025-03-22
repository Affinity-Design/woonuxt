// server/api/products-search.ts
import { defineEventHandler, readBody, createError } from "h3";

export default defineEventHandler(async (event) => {
  try {
    // Get search query from request body
    const body = await readBody(event);
    const { query } = body;
    
    if (!query) {
      return [];
    }

    // Convert query to lowercase for case-insensitive search
    const lowerQuery = query.toLowerCase();
    
    // Get the storage instance
    const storage = useStorage();
    
    // Try to get products from cache
    let cachedProducts = null;
    
    try {
      // Try to get from products cache first
      cachedProducts = await storage.getItem('cached-products');
      
      // If we don't have cached products yet, let's try to build it
      if (!cachedProducts) {
        // Try to fetch products from GraphQL directly
        // This should ideally be cached and periodically updated
        const { data } = await GqlGetProducts({ first: 100 });
        
        if (data?.products?.nodes) {
          // Store the products in cache for future searches
          await storage.setItem('cached-products', data.products.nodes);
          cachedProducts = data.products.nodes;
          
          console.log(`Built initial products cache with ${cachedProducts.length} products`);
        }
      }
    } catch (error) {
      console.error('Error fetching cached products:', error);
      // Fallback to empty array if something went wrong
      cachedProducts = [];
    }
    
    // If we still don't have products, return empty array
    if (!cachedProducts || !Array.isArray(cachedProducts)) {
      return [];
    }
    
    // Filter products based on search query
    const filteredProducts = cachedProducts.filter(product => {
      // Search in name
      if (product.name?.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in description (if exists)
      if (product.description?.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in short description (if exists)
      if (product.shortDescription?.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in SKU (if exists)
      if (product.sku?.toLowerCase().includes(lowerQuery)) return true;
      
      // Search in categories (if exist)
      if (product.productCategories?.nodes) {
        return product.productCategories.nodes.some(
          category => category.name?.toLowerCase().includes(lowerQuery)
        );
      }
      
      return false;
    });
    
    // Return filtered products
    return filteredProducts;
  } catch (error) {
    console.error('Search API error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to perform search',
    });
  }
});
