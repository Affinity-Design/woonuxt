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

// Types for Helcim Level 3 processing tax object (optional)
interface HelcimTax {
  amount: number;
  details?: string; // e.g., "GST 5%", "HST 13%", "Canadian Sales Tax"
}

// Helcim shipping address object
interface HelcimShippingAddress {
  street1: string;
  street2?: string;
  city?: string;
  province?: string;
  country: string; // 3-letter ISO code (CAN, USA, etc.)
  postalCode: string;
}

// Helcim shipping object per API docs
// When using object format, address is REQUIRED
interface HelcimShipping {
  amount: number;
  details: string; // Shipping method name - REQUIRED when using object format
  address: HelcimShippingAddress; // REQUIRED when using object format
}

interface HelcimInvoiceRequest {
  invoiceNumber?: string;
  lineItems?: HelcimLineItem[];
  shipping?: number | HelcimShipping; // Simple number OR full object with address
  tax?: number | HelcimTax; // Simple number OR object with details
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
  const {
    action,
    amount,
    currency = 'CAD',
    paymentType = 'purchase',
    lineItems,
    shippingAmount,
    shippingMethod,
    taxAmount,
    discountAmount,
    customerInfo,
    invoiceNumber,
  } = body;

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
          shippingMethod: shippingMethod || 'Not selected',
        });

        // HelcimCard now sends dollars directly, so use as-is
        const amountInDollars = Number(amount);

        console.log(`[DEBUG Server] Using amount in dollars for Helcim API:`, {
          receivedDollars: amount,
          finalAmountInDollars: amountInDollars,
        });

        // Convert 2-letter country code to 3-letter (Helcim requires ISO alpha-3)
        // Defined early so it can be used in both shipping and customer sections
        const countryTo3Letter = (code: string | undefined): string => {
          const map: Record<string, string> = {
            CA: 'CAN',
            US: 'USA',
            MX: 'MEX',
            GB: 'GBR',
            UK: 'GBR',
            AU: 'AUS',
            FR: 'FRA',
            DE: 'DEU',
            IT: 'ITA',
            ES: 'ESP',
            NL: 'NLD',
            BE: 'BEL',
            CH: 'CHE',
            AT: 'AUT',
            SE: 'SWE',
            NO: 'NOR',
            DK: 'DNK',
            FI: 'FIN',
            IE: 'IRL',
            NZ: 'NZL',
            JP: 'JPN',
            CN: 'CHN',
            IN: 'IND',
            BR: 'BRA',
            AR: 'ARG',
          };
          const upper = (code || 'CA').toUpperCase();
          return map[upper] || (upper.length === 3 ? upper : 'CAN');
        };

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

          // Add shipping - use full object with address if available (for Level 2/3 processing)
          // Otherwise fall back to simple number
          const shippingAmountNum = Number(shippingAmount) || 0;
          const billingAddr = customerInfo?.billingAddress;
          const hasShippingAddress = billingAddr?.address1?.trim() && billingAddr?.postcode?.trim();

          if (shippingAmountNum > 0 || shippingMethod) {
            if (hasShippingAddress) {
              // Use full shipping object with address for Level 2/3 processing benefits
              invoiceRequest.shipping = {
                amount: shippingAmountNum,
                details: shippingMethod || 'Standard Shipping',
                address: {
                  street1: billingAddr.address1.trim(),
                  street2: billingAddr.address2 || '',
                  city: billingAddr.city || '',
                  province: billingAddr.state || '',
                  country: countryTo3Letter(billingAddr.country),
                  postalCode: billingAddr.postcode.trim(),
                },
              };
              console.log('[Helcim API] Using full shipping object with address for Level 2/3 processing');
            } else if (shippingAmountNum > 0) {
              // Fall back to simple number if no address available
              invoiceRequest.shipping = shippingAmountNum;
              // Add shipping method as a comment line item for visibility
              if (shippingMethod) {
                formattedLineItems.push({
                  description: `Shipping Method: ${shippingMethod}`,
                  quantity: 1,
                  price: 0,
                  total: 0,
                });
              }
              console.log('[Helcim API] Using simple shipping amount (no address available yet)');
            }
          }

          // Add tax - use full object with details if we have address (Level 2/3 processing)
          // Otherwise use simple number
          if (taxAmount && Number(taxAmount) > 0) {
            if (hasShippingAddress) {
              invoiceRequest.tax = {
                amount: Number(taxAmount),
                details: 'Canadian Sales Tax',
              };
            } else {
              invoiceRequest.tax = Number(taxAmount);
            }
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
            // Convert country to 3-letter code (Helcim requirement)
            customerRequest.billingAddress = {
              name: customerRequest.contactName!,
              street1: street1!,
              street2: billingAddr?.address2 || '',
              city: billingAddr?.city || '',
              province: billingAddr?.state || '',
              country: countryTo3Letter(billingAddr?.country),
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

        // Note: For Level 2 processing, use top-level taxAmount
        // The invoiceRequest.tax object is for Level 3 and may cause issues
        if (taxAmount && Number(taxAmount) > 0) {
          helcimRequestBody.taxAmount = Number(taxAmount);
        }

        // Log the FULL request body for debugging
        console.log('[Helcim API] Full request body being sent:', JSON.stringify(helcimRequestBody, null, 2));

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
