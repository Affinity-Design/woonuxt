// server/api/contact.ts
// Contact-form relay to the store inbox. Sends via Cloudflare Email Service with SendGrid
// as fallback (server/utils/emailSender.ts). Errors return real HTTP status codes — the old
// handler returned 200 with a {statusCode: 500} body, so the page showed "sent successfully"
// while the email silently failed (how the 2026-08 SendGrid outage went unnoticed).
import {sendStoreEmail} from '../utils/emailSender';
import {getSafeErrorLogDetails} from '#shared/utils/publicErrorMessages.mjs';

const MAX_MESSAGE_LENGTH = 10000;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fail = (event: any, statusCode: number, error: string) => {
  setResponseStatus(event, statusCode);
  return {error};
};

export default defineEventHandler(async (event) => {
  try {
    console.log('Contact API called');
    const config = useRuntimeConfig(event);

    const body = await readBody(event);
    const {name, email, message, turnstileToken} = body || {};

    if (!name || !email || !message) {
      console.error('Missing required form fields');
      return fail(event, 400, 'Please complete all required fields.');
    }

    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      return fail(event, 400, 'Message is too long');
    }

    // Verify Turnstile token if present
    if (turnstileToken) {
      try {
        console.log('Verifying Turnstile token');
        // Secret lives in server-side runtimeConfig; the public fallback covers builds that
        // predate moving it out of client-visible config.
        const turnstileSecretKey = (config as any).turnstileSecretKey || (config.public as any)?.turnstyleSecretKey;

        if (!turnstileSecretKey) {
          console.error('Missing Turnstile secret key in configuration');
          return fail(event, 500, 'The security check is temporarily unavailable. Please try again later.');
        }

        const formData = new FormData();
        formData.append('secret', turnstileSecretKey);
        formData.append('response', turnstileToken);

        const ip = event.node.req.headers['cf-connecting-ip'] || event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress;
        if (ip) {
          formData.append('remoteip', Array.isArray(ip) ? ip[0] : ip);
        }

        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          body: formData,
        });

        const turnstileResult: any = await turnstileResponse.json();
        console.log('Turnstile verification result:', {success: turnstileResult.success, errorCodes: turnstileResult['error-codes']});

        if (!turnstileResult.success) {
          return fail(event, 400, 'The security check failed. Please refresh the page and try again.');
        }
      } catch (error: any) {
        console.error('Contact form security verification failed:', getSafeErrorLogDetails(error));
        return fail(event, 500, 'Failed to verify CAPTCHA');
      }
    }

    console.log('Sending contact email');
    const result = await sendStoreEmail(event, {
      subject: `New Contact Form Submission from ${name}`,
      replyTo: email,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
<p><strong>Name:</strong> ${escapeHtml(name)}</p>
<p><strong>Email:</strong> ${escapeHtml(email)}</p>
<p><strong>Message:</strong></p>
<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    });

    if (!result.sent) {
      console.error('Contact email failed on all providers. Sensitive details were withheld.');
      return fail(event, 502, 'We could not send your message right now. Please try again, or email us directly.');
    }

    console.log(`Contact email sent via ${result.provider}`);
    return {success: true, provider: result.provider};
  } catch (error: any) {
    console.error('Contact form request failed:', getSafeErrorLogDetails(error));
    return fail(event, 500, 'We could not send your message. Please try again or email customer service directly.');
  }
});
