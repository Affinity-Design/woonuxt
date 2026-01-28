// server/api/helcim.post.ts
import {defineEventHandler, createError, readBody} from 'h3';

// Types for Helcim line items
interface HelcimLineItem {
  description: string;
  quantity: number;
  price: number;
  total: number; // Required by Helcim API - price * quantity
  sku?: string;
}

interface HelcimCustomerRequest {
  customerCode?: string;
  contactName?: string;
  businessName?: string;
  cellPhone?: string;
  billingAddress?: {
    name?: string;
    street1?: string;
    street2?: string;
    city?: string;
    province?: string;
    country?: string;
    postalCode?: string;
  };
}

// Types for Helcim Level 3 processing tax object
interface HelcimTax {
  amount: number;
  details?: string; // e.g., "GST 5%", "HST 13%"
}

interface HelcimInvoiceRequest {
  invoiceNumber?: string;
  lineItems?: HelcimLineItem[];
  shipping?: number;
  tax?: HelcimTax; // Level 3 requires tax as object with amount and details
  discount?: number;
}

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const helcimApiToken = runtimeConfig.helcimApiToken;

  // Ensure the API token is present
  if (!helcimApiToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Helcim API token is missing. Please check your configuration.',
    });
  }

  const body = await readBody(event);
  const {action, amount, currency = 'CAD', paymentType = 'purchase', lineItems, shippingAmount, taxAmount, discountAmount, customerInfo, invoiceNumber} = body;

  try {
    // Handle different Helcim actions
    switch (action) {
      case 'initialize':
        if (!amount) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Amount is required for Helcim initialization',
          });
        }

        console.log(`[DEBUG Server] Helcim API request:`, {
          receivedAmount: amount,
          receivedAmountType: typeof amount,
          convertedAmount: Number(amount),
          currency: currency,
          paymentType: paymentType,
          hasLineItems: !!lineItems,
          lineItemCount: lineItems?.length || 0,
        });

        // HelcimCard now sends dollars directly, so use as-is
        const amountInDollars = Number(amount);

        console.log(`[DEBUG Server] Using amount in dollars for Helcim API:`, {
          receivedDollars: amount,
          finalAmountInDollars: amountInDollars,
        });

        // Build the request body for Helcim
        const helcimRequestBody: any = {
          paymentType: paymentType,
          amount: amountInDollars, // Amount in dollars
          currency: currency,
          // Digital wallets (Google Pay, Apple Pay) are disabled by default per Helcim docs
          // DO NOT include digitalWallet parameter - if they still show, disable in Helcim dashboard
        };

        // Add invoiceRequest with line items if provided
        // This creates an invoice in Helcim with order details
        if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
          const formattedLineItems: HelcimLineItem[] = lineItems.map((item: any) => {
            const qty = Number(item.quantity) || 1;
            const unitPrice = Number(item.price) || 0;
            const lineTotal = Number(item.total) || qty * unitPrice;
            return {
              description: item.description || item.name || 'Product',
              quantity: qty,
              price: unitPrice,
              total: parseFloat(lineTotal.toFixed(2)), // Required by Helcim
              ...(item.sku && {sku: item.sku}),
            };
          });

          // Build invoice request
          const invoiceRequest: HelcimInvoiceRequest = {
            lineItems: formattedLineItems,
          };

          // Add invoice number if provided
          if (invoiceNumber) {
            invoiceRequest.invoiceNumber = invoiceNumber;
          }

          // Add shipping as a separate amount if provided
          if (shippingAmount && Number(shippingAmount) > 0) {
            invoiceRequest.shipping = Number(shippingAmount);
          }

          // Add tax as object for Level 3 processing (not just a number)
          // Helcim docs: tax: { amount: 5, details: "GST" }
          if (taxAmount && Number(taxAmount) > 0) {
            invoiceRequest.tax = {
              amount: Number(taxAmount),
              details: 'Tax', // Could be enhanced to specify HST/GST based on province
            };
          }

          // Add discount if provided
          if (discountAmount && Number(discountAmount) > 0) {
            invoiceRequest.discount = Number(discountAmount);
          }

          helcimRequestBody.invoiceRequest = invoiceRequest;

          console.log('[Helcim API] Including invoice with line items:', {
            lineItemCount: formattedLineItems.length,
            lineItems: formattedLineItems,
            shipping: invoiceRequest.shipping,
            tax: invoiceRequest.tax,
            discount: invoiceRequest.discount,
          });
        }

        // Add customer information ONLY if user has filled in required details
        // Don't send empty/placeholder data - causes Helcim API errors
        // Customer info will be sent when user actually has filled in their billing details
        if (customerInfo) {
          const contactName = customerInfo.name?.trim();
          const email = customerInfo.email?.trim();
          const billingAddr = customerInfo.billingAddress;
          const street1 = billingAddr?.address1?.trim();
          const postalCode = billingAddr?.postcode?.trim();

          // Only include customerRequest if we have REAL data (not empty form fields)
          // Required: contactName OR email, AND street1 AND postalCode
          const hasName = contactName && contactName.length > 0;
          const hasEmail = email && email.length > 0;
          const hasAddress = street1 && street1.length > 0 && postalCode && postalCode.length > 0;

          if ((hasName || hasEmail) && hasAddress) {
            const customerRequest: HelcimCustomerRequest = {};

            // Use name if available, otherwise email
            customerRequest.contactName = hasName ? contactName : email;

            if (hasEmail) {
              customerRequest.customerCode = email;
            }
            if (customerInfo.phone?.trim()) {
              customerRequest.cellPhone = customerInfo.phone.trim();
            }

            // Add billing address (we know required fields are present)
            customerRequest.billingAddress = {
              name: customerRequest.contactName!,
              street1: street1!,
              street2: billingAddr?.address2 || '',
              city: billingAddr?.city || '',
              province: billingAddr?.state || '',
              country: billingAddr?.country || 'CA',
              postalCode: postalCode!,
            };

            helcimRequestBody.customerRequest = customerRequest;
            console.log('[Helcim API] Including customer info (user has filled in details):', customerRequest);
          } else {
            console.log('[Helcim API] Skipping customerRequest - user has not filled in required details yet', {
              hasName,
              hasEmail,
              hasAddress,
            });
          }
        }

        // Note: Tax is now included in invoiceRequest.tax for Level 3 processing
        // No need for separate top-level taxAmount

        const response = await fetch('https://api.helcim.com/v2/helcim-pay/initialize', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-token': helcimApiToken as string,
            'content-type': 'application/json',
          },
          body: JSON.stringify(helcimRequestBody),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`[Helcim API] HTTP Error ${response.status}:`, errorData);
          throw new Error(`Helcim API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();

        console.log('[DEBUG Server] Helcim API response:', {
          hasCheckoutToken: !!data.checkoutToken,
          hasSecretToken: !!data.secretToken,
          sentAmount: amountInDollars,
          hadLineItems: !!lineItems,
        });

        return {
          success: true,
          checkoutToken: data.checkoutToken,
          secretToken: data.secretToken,
        };

      case 'validate':
        // Ensure this runs only on server-side
        if (process.client || typeof window !== 'undefined') {
          throw createError({
            statusCode: 500,
            statusMessage: 'Validation must run server-side only',
          });
        }

        const {transactionData, secretToken} = body;

        if (!transactionData || !secretToken) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Transaction data and secret token are required for validation',
          });
        }

        try {
          // The hash should be calculated from the data object + secret token
          // Helcim response structure: {"data":{"hash":"...","data":{"transactionId":"..."}}}
          const dataToHash = transactionData.data?.data || transactionData.data || transactionData;
          const cleanedJsonData = JSON.stringify(dataToHash);

          let expectedHash;

          // Check if we're in a Node.js environment with crypto module
          try {
            // Try Node.js crypto first (server-side)
            const crypto = await import('crypto');
            expectedHash = crypto
              .createHash('sha256')
              .update(cleanedJsonData + secretToken)
              .digest('hex');
          } catch (nodeError) {
            // Fallback to Web Crypto API if Node.js crypto not available
            if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
              const encoder = new TextEncoder();
              const data = encoder.encode(cleanedJsonData + secretToken);
              const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              expectedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            } else {
              throw new Error('No crypto implementation available');
            }
          }

          const receivedHash = transactionData.data?.hash || transactionData.hash;
          const isValid = expectedHash === receivedHash;

          console.log('[Helcim Validation]', {
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
        } catch (cryptoError: any) {
          console.error('[Helcim Validation] Crypto error:', cryptoError);
          throw createError({
            statusCode: 500,
            statusMessage: `Validation failed: ${cryptoError.message}`,
          });
        }

      default:
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid action. Supported actions: initialize, validate',
        });
    }
  } catch (error: any) {
    console.error(`[Helcim API] Error (${action}):`, error);

    return {
      success: false,
      error: {
        message: error.message || 'An error occurred with Helcim API',
        code: error.code || 'unknown_error',
        statusCode: error.statusCode || 500,
      },
    };
  }
});
