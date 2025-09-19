// server/api/helcim.post.ts
import { defineEventHandler, createError, readBody } from "h3";

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const helcimApiToken = runtimeConfig.helcimApiToken;

  // Ensure the API token is present
  if (!helcimApiToken) {
    throw createError({
      statusCode: 500,
      statusMessage:
        "Helcim API token is missing. Please check your configuration.",
    });
  }

  const body = await readBody(event);
  const { action, amount, currency = "CAD", paymentType = "purchase" } = body;

  try {
    // Handle different Helcim actions
    switch (action) {
      case "initialize":
        if (!amount) {
          throw createError({
            statusCode: 400,
            statusMessage: "Amount is required for Helcim initialization",
          });
        }

        console.log(`[DEBUG Server] Helcim API request:`, {
          receivedAmount: amount,
          receivedAmountType: typeof amount,
          convertedAmount: Number(amount),
          currency: currency,
          paymentType: paymentType,
        });

        // HelcimCard now sends dollars directly, so use as-is
        const amountInDollars = Number(amount);

        console.log(`[DEBUG Server] Using amount in dollars for Helcim API:`, {
          receivedDollars: amount,
          finalAmountInDollars: amountInDollars,
        });

        const response = await fetch(
          "https://api.helcim.com/v2/helcim-pay/initialize",
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "api-token": helcimApiToken as string,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              paymentType: paymentType,
              amount: amountInDollars, // Amount in dollars
              currency: currency,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          console.error(
            `[Helcim API] HTTP Error ${response.status}:`,
            errorData
          );
          throw new Error(
            `Helcim API error: ${response.status} - ${errorData}`
          );
        }

        const data = await response.json();

        console.log("[DEBUG Server] Helcim API response:", {
          hasCheckoutToken: !!data.checkoutToken,
          hasSecretToken: !!data.secretToken,
          sentAmount: amountInDollars,
        });

        return {
          success: true,
          checkoutToken: data.checkoutToken,
          secretToken: data.secretToken,
        };

      case "validate":
        const { transactionData, secretToken } = body;

        if (!transactionData || !secretToken) {
          throw createError({
            statusCode: 400,
            statusMessage:
              "Transaction data and secret token are required for validation",
          });
        }

        // Validate the transaction hash according to Helcim documentation
        const crypto = await import("crypto");

        // The hash should be calculated from the data object + secret token
        // Helcim response structure: {"data":{"hash":"...","data":{"transactionId":"..."}}}
        const dataToHash =
          transactionData.data?.data || transactionData.data || transactionData;
        const cleanedJsonData = JSON.stringify(dataToHash);
        const expectedHash = crypto
          .createHash("sha256")
          .update(cleanedJsonData + secretToken)
          .digest("hex");

        const receivedHash = transactionData.data?.hash || transactionData.hash;
        const isValid = expectedHash === receivedHash;

        console.log("[Helcim Validation]", {
          dataStructure: Object.keys(transactionData),
          hasDataProperty: !!transactionData.data,
          hasHashProperty: !!transactionData.hash,
          expectedHash,
          receivedHash,
          isValid,
        });

        return {
          success: true,
          isValid,
          expectedHash,
          receivedHash,
          transactionId: dataToHash.transactionId,
        };

      default:
        throw createError({
          statusCode: 400,
          statusMessage:
            "Invalid action. Supported actions: initialize, validate",
        });
    }
  } catch (error: any) {
    console.error(`[Helcim API] Error (${action}):`, error);

    return {
      success: false,
      error: {
        message: error.message || "An error occurred with Helcim API",
        code: error.code || "unknown_error",
        statusCode: error.statusCode || 500,
      },
    };
  }
});
