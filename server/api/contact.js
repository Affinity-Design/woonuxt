// server/api/contact.js
import { google } from "googleapis";
import { Buffer } from "buffer";

export default defineEventHandler(async (event) => {
  try {
    console.log("Contact API called");

    // Get runtime config to access environment variables
    const config = useRuntimeConfig();

    // Gmail API credentials from environment variables
    const GMAIL_CLIENT_ID = config.GMAIL_CLIENT_ID;
    const GMAIL_CLIENT_SECRET = config.GMAIL_CLIENT_SECRET;
    const GMAIL_REFRESH_TOKEN = config.GMAIL_REFRESH_TOKEN;
    const GMAIL_REDIRECT_URI =
      config.GMAIL_REDIRECT_URI ||
      "https://developers.google.com/oauthplayground";
    const RECEIVING_EMAIL = config.RECEIVING_EMAIL;

    // Log credential availability (not values)
    console.log("Credentials check:", {
      hasClientId: !!GMAIL_CLIENT_ID,
      hasClientSecret: !!GMAIL_CLIENT_SECRET,
      hasRefreshToken: !!GMAIL_REFRESH_TOKEN,
      hasRedirectUri: !!GMAIL_REDIRECT_URI,
      hasReceivingEmail: !!RECEIVING_EMAIL,
    });

    // Validate that all required credentials are available
    if (
      !GMAIL_CLIENT_ID ||
      !GMAIL_CLIENT_SECRET ||
      !GMAIL_REFRESH_TOKEN ||
      !RECEIVING_EMAIL
    ) {
      console.error("Missing Gmail API credentials");
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Server configuration error - missing Gmail API credentials",
        }),
      };
    }

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

    // Configure OAuth2 client
    console.log("Setting up OAuth2 client");
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN,
    });

    // Create Gmail API client
    console.log("Creating Gmail API client");
    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    // Helper function to encode the email to base64
    function createMessage({ name, email, message }) {
      const emailContent = `From: "Contact Form" <${RECEIVING_EMAIL}>
To: ${RECEIVING_EMAIL}
Subject: New Contact Form Submission from ${name}
Content-Type: text/plain; charset=utf-8
MIME-Version: 1.0

Name: ${name}
Email: ${email}

Message:
${message}
`;

      // Encode to base64
      return Buffer.from(emailContent)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    // Create the email message
    console.log("Creating email message");
    const encodedMessage = createMessage({ name, email, message });

    // Send the email using Gmail API
    console.log("Sending email via Gmail API");
    try {
      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log("Email sent successfully:", result.data.id);

      // Return success response
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          messageId: result.data.id,
        }),
      };
    } catch (gmailError) {
      console.error("Gmail API error:", gmailError);

      let errorDetails = {
        message: gmailError.message,
      };

      if (gmailError.response) {
        errorDetails.statusCode = gmailError.response.status;
        errorDetails.statusText = gmailError.response.statusText;

        if (gmailError.response.data) {
          errorDetails.data = gmailError.response.data;
        }
      }

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Gmail API error",
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
