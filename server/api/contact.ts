// server/api/contact.ts
import sgMail from "@sendgrid/mail";
import { useRuntimeConfig } from "#imports";

export default defineEventHandler(async (event) => {
  try {
    console.log("Contact API called");

    // Get runtime config to access environment variables
    const config = useRuntimeConfig();

    // SendGrid API key from environment variables
    const SENDGRID_API_KEY = config.SENDGRID_API_KEY;
    const SENDING_EMAIL = config.SENDING_EMAIL;
    const RECEIVING_EMAIL = config.RECEIVING_EMAIL;

    // Log credential availability (not values)
    console.log("Credentials check:", {
      hasSendGridApiKey: !!SENDGRID_API_KEY,
      hasSendingEmail: !!SENDING_EMAIL,
      hasReceivingEmail: !!RECEIVING_EMAIL,
    });

    // Validate that all required credentials are available
    if (!SENDGRID_API_KEY || !SENDING_EMAIL || !RECEIVING_EMAIL) {
      console.error("Missing SendGrid API credentials");
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "Server configuration error - missing SendGrid API credentials",
        }),
      };
    }

    // Set SendGrid API key
    sgMail.setApiKey(SENDGRID_API_KEY);

    // Get form data from request
    const body = await readBody(event);
    console.log("Form data received (excluding sensitive details)");

    const { name, email, message, turnstileToken } = body;

    // Input validation
    if (!name || !email || !message) {
      console.error("Missing required form fields");
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields",
          details: {
            hasName: !!name,
            hasEmail: !!email,
            hasMessage: !!message,
            hasTurnstileToken: !!turnstileToken,
          },
        }),
      };
    }

    // Verify Turnstile token if present
    if (turnstileToken) {
      try {
        console.log("Verifying Turnstile token");
        const turnstileSecretKey = config.public.turnstyleSecretKey;

        if (!turnstileSecretKey) {
          console.error("Missing Turnstile secret key in configuration");
          return {
            statusCode: 500,
            body: JSON.stringify({
              error:
                "Server configuration error - missing Turnstile secret key",
            }),
          };
        }

        const formData = new FormData();
        formData.append("secret", turnstileSecretKey);
        formData.append("response", turnstileToken);

        const ip =
          event.node.req.headers["cf-connecting-ip"] ||
          event.node.req.headers["x-forwarded-for"] ||
          event.node.req.socket.remoteAddress;

        if (ip) {
          formData.append("remoteip", ip);
        }

        const turnstileResponse = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: formData,
          }
        );

        const turnstileResult = await turnstileResponse.json();
        console.log("Turnstile verification result:", turnstileResult);

        if (!turnstileResult.success) {
          console.error("Turnstile verification failed:", turnstileResult);
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: "CAPTCHA verification failed",
              details: turnstileResult["error-codes"] || [],
            }),
          };
        }

        console.log("Turnstile verification successful");
      } catch (error) {
        console.error("Error during Turnstile verification:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: "Failed to verify CAPTCHA",
            details: error.message,
          }),
        };
      }
    }

    // Create email message for SendGrid
    console.log("Creating email message");
    const msg = {
      to: RECEIVING_EMAIL,
      from: SENDING_EMAIL,
      subject: `New Contact Form Submission from ${name}`,
      text: `
Name: ${name}
Email: ${email}

Message:
${message}
      `,
      html: `
<p><strong>Name:</strong> ${name}</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Message:</strong></p>
<p>${message.replace(/\n/g, "<br>")}</p>
      `,
      replyTo: email,
    };

    // Send the email using SendGrid
    console.log("Sending email via SendGrid");
    try {
      const result = await sgMail.send(msg);

      console.log("Email sent successfully:", result[0].statusCode);

      // Return success response
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          statusCode: result[0].statusCode,
        }),
      };
    } catch (sendGridError) {
      console.error("SendGrid API error:", sendGridError);

      let errorDetails = {
        message: sendGridError.message,
      };

      if (sendGridError.response) {
        errorDetails.statusCode = sendGridError.response.statusCode;
        errorDetails.body = sendGridError.response.body;
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "SendGrid API error",
          details: errorDetails,
        }),
      };
    }
  } catch (error) {
    // Log the full error for debugging
    console.error("Unhandled error in contact API:", error);

    // Generic error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process contact form",
        message: error.message || "Unknown error",
      }),
    };
  }
});
