// server/api/contact.js
import { google } from "googleapis";
import { Buffer } from "buffer";

// Gmail API credentials
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI ||
  "https://developers.google.com/oauthplayground";
const RECEIVING_EMAIL = process.env.RECEIVING_EMAIL; // The email address to receive contact form submissions

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
From: "Contact Form" <${RECEIVING_EMAIL}>
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

export default defineEventHandler(async (event) => {
  try {
    // Get form data from request
    const body = await readBody(event);
    const { name, email, message } = body;

    // Input validation
    if (!name || !email || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      };
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

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, messageId: result.data.id }),
    };
  } catch (error) {
    console.error("Error sending email:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to send email",
        details: error.message,
      }),
    };
  }
});
