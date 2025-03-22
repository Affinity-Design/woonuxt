// server/api/webhook/woocommerce.ts
import { defineEventHandler, readBody, createError } from "h3";

export default defineEventHandler(async (event) => {
  // Get the webhook data
  const payload = await readBody(event);
  
  // Get headers for potential signature verification
  const headers = event.node.req.headers;
  
  // Extract relevant information based on webhook type
  const webhookTopic = headers['x-wc-webhook-topic'] || 'unknown';

  console.log(`Processing webhook: ${webhookTopic}`);

  try {
    // Initialize revalidation paths array
    const pathsToRevalidate = [];

    // Handle product-related webhooks
    if (webhookTopic.includes('product')) {
      // Get product information
      const productId = payload.id;
      const productSlug = payload.slug;
      
      if (productSlug) {
        // Revalidate specific product page
        const productPath = `/product/${productSlug}`;
        pathsToRevalidate.push(productPath);
        
        // Revalidate the products page
        pathsToRevalidate.push('/products');
        
        // If the product was added/removed from categories, revalidate those too
        if (payload.categories && Array.isArray(payload.categories)) {
          for (const category of payload.categories) {
            if (category.slug) {
              const categoryPath = `/product-category/${category.slug}`;
              pathsToRevalidate.push(categoryPath);
            }
          }
        }
      }
    }
    // Handle category-related webhooks
    else if (webhookTopic.includes('product_cat')) {
      const categorySlug = payload.slug;
      
      if (categorySlug) {
        // Revalidate specific category page
        const categoryPath = `/product-category/${categorySlug}`;
        pathsToRevalidate.push(categoryPath);
        
        // Revalidate the categories page
        pathsToRevalidate.push('/categories');
      }
    }
    // Handle order-related webhooks (to potentially update low stock items)
    else if (webhookTopic.includes('order')) {
      // For order updates, we might want to revalidate product pages if stock status changed
      // But this requires additional data and logic, so for now, just log it
      console.log('Order webhook received:', webhookTopic);
    }

    // Always revalidate the homepage to ensure featured products are up to date
    pathsToRevalidate.push('/');
    
    // Process all revalidation paths
    const revalidationResults = {};
    
    for (const path of pathsToRevalidate) {
      try {
        const response = await $fetch("/api/revalidate", {
          method: "POST",
          body: {
            secret: process.env.REVALIDATION_SECRET,
            path,
          },
        });
        
        revalidationResults[path] = response;
        console.log(`Revalidated ${path}:`, response);
      } catch (error) {
        console.error(`Error revalidating ${path}:`, error);
        revalidationResults[path] = { error: true, message: error.message };
      }
    }

    return { 
      success: true, 
      topic: webhookTopic,
      revalidated: pathsToRevalidate,
      results: revalidationResults
    };
  } catch (error) {
    console.error("Webhook handler error:", error);
    return createError({
      statusCode: 500,
      statusMessage: "Error processing webhook",
      data: { error: error.message }
    });
  }
});
