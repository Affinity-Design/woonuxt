// server/api/stripe.post.ts
import Stripe from "stripe";
import { defineEventHandler, createError, readBody } from "h3";
import { useRuntimeConfig } from "#imports";

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const stripeSecretKey = runtimeConfig.stripeSecretKey;

  // Ensure the secret key is present
  if (!stripeSecretKey) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "Stripe secret key is missing. Please check your configuration.",
    });
  }

  // Initialize Stripe with the secret key
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2022-11-15", // Consider updating to a newer version
  });

  const body = await readBody(event);
  const { action, amount, paymentMethodId, customerId, metadata } = body;

  try {
    // Handle different Stripe actions
    switch (action) {
      case "create_payment_intent":
        if (!amount) {
          throw createError({
            statusCode: 400,
            statusMessage: "Amount is required for payment intent",
          });
        }

        const paymentIntentOptions = {
          amount: Number(amount), // Amount in cents
          currency: "cad",
          metadata: metadata || {},
        };

        // Add payment method if provided
        if (paymentMethodId) {
          paymentIntentOptions.payment_method = paymentMethodId;
          paymentIntentOptions.confirm = true;
          paymentIntentOptions.return_url = `${event.node.req.headers.origin}/checkout/order-received`;
        }

        const paymentIntent =
          await stripe.paymentIntents.create(paymentIntentOptions);

        return {
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        };

      case "create_setup_intent":
        const setupIntent = await stripe.setupIntents.create({
          usage: "off_session",
          customer: customerId,
        });

        return {
          success: true,
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
        };

      case "retrieve_payment_method":
        if (!paymentMethodId) {
          throw createError({
            statusCode: 400,
            statusMessage: "Payment method ID is required",
          });
        }

        const paymentMethod =
          await stripe.paymentMethods.retrieve(paymentMethodId);

        return {
          success: true,
          paymentMethod,
        };

      default:
        throw createError({
          statusCode: 400,
          statusMessage:
            "Invalid action. Supported actions: create_payment_intent, create_setup_intent, retrieve_payment_method",
        });
    }
  } catch (error) {
    console.error(`Stripe API Error (${action}):`, error);

    return {
      success: false,
      error: {
        message: error.message || "An error occurred with Stripe",
        code: error.code || "unknown_error",
        statusCode: error.statusCode || 500,
      },
    };
  }
});
