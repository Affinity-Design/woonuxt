// Store-to-self email sender. Provider chain, first configured+working one wins:
//   1. EMAIL_SENDER Service binding -> workers/email-sender (send_email binding lives there —
//      Pages projects can't hold one directly). Tokenless, but needs account-admin dashboard
//      steps (Email Routing + verified destination) that our Cloudflare role can't perform yet.
//   2. WordPress backend relay -> /wp-json/psp/v1/contact-relay (wp_mail on the .com site,
//      same transport as WooCommerce order emails). Fully under our admin control — the
//      working path while the Cloudflare account role is blocked. Snippet:
//      wordpress/psp-contact-relay-snippet.php.
//   3. Cloudflare Email Sending REST API — needs an API token with "Email Sending: Edit"
//      (account permissions currently can't mint one).
//   4. SendGrid (legacy fallback).
//
// Free-tier constraint that makes 1 and 2 work without a Workers Paid plan: sends TO a verified
// Email Routing destination address are free and unmetered, but the FROM must be on a domain
// with Email Routing enabled (proskatersplace.ca). Arbitrary recipients would need the domain
// onboarded under Email Sending + Workers Paid.
import sgMail from '@sendgrid/mail';
import type {H3Event} from 'h3';

export interface StoreEmailInput {
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface StoreEmailResult {
  sent: boolean;
  provider?: 'cloudflare-worker' | 'wordpress' | 'cloudflare-rest' | 'sendgrid';
  errors: string[];
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/** Reads a server config value from runtimeConfig, the Pages runtime env, or process.env. */
const readSetting = (event: H3Event, key: string): string | undefined => {
  const config = useRuntimeConfig(event) as Record<string, any>;
  const cloudflareEnv = (event.context as any)?.cloudflare?.env || {};
  const value = config[key] || cloudflareEnv[key] || process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

/**
 * Sends an email to the store's own inbox (RECEIVING_EMAIL). Tries Cloudflare Email Service,
 * then SendGrid. Never throws — inspect `sent` and `errors` (safe to log, never contains
 * secrets or customer message content).
 */
export async function sendStoreEmail(event: H3Event, input: StoreEmailInput): Promise<StoreEmailResult> {
  const errors: string[] = [];

  const receivingEmail = readSetting(event, 'RECEIVING_EMAIL');
  if (!receivingEmail) {
    return {sent: false, errors: ['RECEIVING_EMAIL is not configured']};
  }

  // --- 1. Service binding to workers/email-sender (tokenless) ---
  const emailWorker = (event.context as any)?.cloudflare?.env?.EMAIL_SENDER;
  if (emailWorker?.fetch) {
    try {
      // Host is arbitrary for service-binding fetches; the bound Worker always answers.
      const response = await emailWorker.fetch('https://psp-email-sender/send', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          subject: input.subject,
          text: input.text,
          ...(input.html ? {html: input.html} : {}),
          ...(input.replyTo ? {replyTo: input.replyTo} : {}),
        }),
      });
      const data: any = await response.json().catch(() => null);
      if (response.ok && data?.success) {
        console.log('[emailSender] Sent via email-sender Worker:', {messageId: data?.messageId});
        return {sent: true, provider: 'cloudflare-worker', errors};
      }
      errors.push(`email-sender Worker responded with HTTP ${response.status}`);
    } catch (error: any) {
      errors.push('email-sender Worker call failed');
    }
  } else {
    errors.push('EMAIL_SENDER service binding not present');
  }

  // --- 2. WordPress backend relay (wp_mail on the WooCommerce site) ---
  const config = useRuntimeConfig(event) as Record<string, any>;
  const wpBaseUrl = (config.public as any)?.wpBaseUrl || readSetting(event, 'BASE_URL');
  const wpUsername = readSetting(event, 'wpAdminUsername') || readSetting(event, 'WP_ADMIN_USERNAME');
  const wpAppPassword = readSetting(event, 'wpAdminAppPassword') || readSetting(event, 'WP_ADMIN_APP_PASSWORD');
  if (wpBaseUrl && wpUsername && wpAppPassword) {
    try {
      // Same auth + header shape as create-admin-order.post.ts, which calls this
      // WordPress daily without tripping the WAF.
      const basicAuth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
      const response: any = await $fetch(`${wpBaseUrl}/wp-json/psp/v1/contact-relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
          'User-Agent': 'WooNuxt-Contact-Relay/1.0',
          Origin: wpBaseUrl,
          Referer: wpBaseUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: {
          subject: input.subject,
          text: input.text,
          ...(input.replyTo ? {replyTo: input.replyTo} : {}),
          source: 'proskatersplace.ca contact form',
        },
      });
      if (response?.success) {
        console.log('[emailSender] Sent via WordPress relay (wp_mail)');
        return {sent: true, provider: 'wordpress', errors};
      }
      errors.push('WordPress relay responded without success');
    } catch (error: any) {
      errors.push('WordPress relay call failed');
    }
  } else {
    errors.push('WordPress relay not configured (needs BASE_URL + WP admin app password)');
  }

  // --- 3. Cloudflare Email Service REST API ---
  const cfAccountId = readSetting(event, 'CF_ACCOUNT_ID');
  const cfEmailToken = readSetting(event, 'CF_EMAIL_API_TOKEN');
  // FROM must be @proskatersplace.ca (a routing domain on the account) — the .com SendGrid
  // sender identity is not valid here, hence a separate variable.
  const cfEmailFrom = readSetting(event, 'CF_EMAIL_FROM');

  if (cfAccountId && cfEmailToken && cfEmailFrom) {
    try {
      const response: any = await $fetch(`${CF_API_BASE}/accounts/${cfAccountId}/email/sending/send`, {
        method: 'POST',
        headers: {Authorization: `Bearer ${cfEmailToken}`},
        body: {
          from: cfEmailFrom,
          to: receivingEmail,
          subject: input.subject,
          text: input.text,
          ...(input.html ? {html: input.html} : {}),
          // REST API is snake_case here (the Workers binding uses replyTo).
          ...(input.replyTo ? {reply_to: input.replyTo} : {}),
        },
      });

      if (response?.success) {
        console.log('[emailSender] Sent via Cloudflare Email REST API:', {
          delivered: response?.result?.delivered?.length ?? 0,
          queued: response?.result?.queued?.length ?? 0,
          bounced: response?.result?.permanent_bounces?.length ?? 0,
        });
        return {sent: true, provider: 'cloudflare-rest', errors};
      }

      errors.push('Cloudflare Email API returned success=false');
    } catch (error: any) {
      errors.push('Cloudflare Email API request failed');
    }
  } else {
    errors.push('Cloudflare email not configured (needs CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, CF_EMAIL_FROM)');
  }

  // --- 4. SendGrid (legacy fallback) ---
  const sendgridApiKey = readSetting(event, 'SENDGRID_API_KEY');
  const sendgridFrom = readSetting(event, 'SENDING_EMAIL');

  if (sendgridApiKey && sendgridFrom) {
    try {
      sgMail.setApiKey(sendgridApiKey);
      await sgMail.send({
        to: receivingEmail,
        from: sendgridFrom,
        subject: input.subject,
        text: input.text,
        ...(input.html ? {html: input.html} : {}),
        ...(input.replyTo ? {replyTo: input.replyTo} : {}),
      });
      console.log('[emailSender] Sent via SendGrid fallback');
      return {sent: true, provider: 'sendgrid', errors};
    } catch (error: any) {
      errors.push('SendGrid request failed');
    }
  } else {
    errors.push('SendGrid not configured (needs SENDGRID_API_KEY, SENDING_EMAIL)');
  }

  console.error('[emailSender] All providers failed. Sensitive details were withheld.');
  return {sent: false, errors};
}
