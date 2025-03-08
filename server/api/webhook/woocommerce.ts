// server/api/webhook/woocommerce.ts
import { defineEventHandler, readBody } from "h3";

export default defineEventHandler(async (event) => {
  // Verify webhook signature from WooCommerce if needed

  // Get the webhook data
  const payload = await readBody(event);

  // Extract product ID and handle revalidation based on webhook
  const productId = payload.id;

  if (productId) {
    try {
      // Revalidate the product page
      const productPath = `/product/${payload.slug}`;

      // Call our revalidation API
      await $fetch("/api/revalidate", {
        method: "POST",
        body: {
          secret: process.env.REVALIDATION_SECRET,
          path: productPath,
        },
      });

      // Also revalidate any category pages this product belongs to
      if (payload.categories) {
        for (const category of payload.categories) {
          const categoryPath = `/product-category/${category.slug}`;
          await $fetch("/api/revalidate", {
            method: "POST",
            body: {
              secret: process.env.REVALIDATION_SECRET,
              path: categoryPath,
            },
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Webhook handler error:", error);
      return createError({
        statusCode: 500,
        statusMessage: "Error processing webhook",
      });
    }
  }

  return { received: true };
});
