// server/api/contact.js
import { google } from "googleapis";
import { Buffer } from "buffer";

export default defineEventHandler(async (event) => {
  try {
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

    // Validate that all required credentials are available
    if (
      !GMAIL_CLIENT_ID ||
      !GMAIL_CLIENT_SECRET ||
      !GMAIL_REFRESH_TOKEN ||
      !RECEIVING_EMAIL
    ) {
      console.error("Missing Gmail API credentials:", {
        hasClientId: !!GMAIL_CLIENT_ID,
        hasClientSecret: !!GMAIL_CLIENT_SECRET,
        hasRefreshToken: !!GMAIL_REFRESH_TOKEN,
        hasReceivingEmail: !!RECEIVING_EMAIL,
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Server configuration error - missing Gmail API credentials",
        }),
      };
    }

    // Get form data from request
    const body = await readBody(event);
    const { name, email, message, turnstileToken } = body;

    // Input validation
    if (!name || !email || !message || !turnstileToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    // Verify Turnstile token
    try {
      const turnstileSecretKey = config.public.turnstyleSecretKey;

      if (!turnstileSecretKey) {
        console.error("Missing Turnstile secret key in configuration");
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Server configuration error" }),
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
    } catch (error) {
      console.error("Error verifying Turnstile token:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to verify CAPTCHA" }),
      };
    }

    // Configure OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN,
    });

    // Create Gmail API client
    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    // Helper function to encode the email to base64
    function createMessage({ name, email, message }) {
      const emailContent = `
From: "${name}" <${email}>
To: ${RECEIVING_EMAIL}
Subject: New Contact Form Submission from ${name}
Content-Type: text/plain; charset=utf-8

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
    const encodedMessage = createMessage({ name, email, message });

    // Send the email using Gmail API
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, messageId: result.data.id }),
    };
  } catch (error) {
    // Log the full error for debugging
    console.error("Error sending email:", error);

    // Check for specific error types
    if (error.code === "ENOTFOUND") {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Network error - unable to reach Gmail API",
        }),
      };
    }

    if (error.response && error.response.data) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Gmail API error",
          details: error.response.data.error,
        }),
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to send email",
        message: error.message || "Unknown error",
      }),
    };
  }
});
