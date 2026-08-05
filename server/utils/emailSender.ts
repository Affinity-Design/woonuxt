// Store-to-self email sender: Cloudflare Email Service first, SendGrid as fallback.
//
// Cloudflare Email Sending (public beta, Apr 2026) is used via the REST API rather than a
// send_email Worker binding on purpose: bindings only apply on the next deployment and the
// 2026-07-18 outage came from a dropped Pages binding — a plain HTTPS call has no such failure
// mode and works identically in local dev, test, and prod.
//
// Free-tier constraint that makes this work without a Workers Paid plan: sends TO a verified
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
  provider?: 'cloudflare' | 'sendgrid';
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

  // --- Cloudflare Email Service (primary) ---
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
          ...(input.replyTo ? {replyTo: input.replyTo} : {}),
        },
      });

      if (response?.success) {
        console.log('[emailSender] Sent via Cloudflare Email Service:', {
          delivered: response?.result?.delivered?.length ?? 0,
          queued: response?.result?.queued?.length ?? 0,
          bounced: response?.result?.permanent_bounces?.length ?? 0,
        });
        return {sent: true, provider: 'cloudflare', errors};
      }

      errors.push(`Cloudflare Email API returned success=false: ${JSON.stringify(response?.errors || [])}`);
    } catch (error: any) {
      const apiErrors = error?.data?.errors ? JSON.stringify(error.data.errors) : error?.message || 'unknown error';
      errors.push(`Cloudflare Email API request failed: ${apiErrors}`);
    }
  } else {
    errors.push('Cloudflare email not configured (needs CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, CF_EMAIL_FROM)');
  }

  // --- SendGrid (fallback) ---
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
      const detail = error?.response?.body ? JSON.stringify(error.response.body) : error?.message || 'unknown error';
      errors.push(`SendGrid request failed: ${detail}`);
    }
  } else {
    errors.push('SendGrid not configured (needs SENDGRID_API_KEY, SENDING_EMAIL)');
  }

  console.error('[emailSender] All providers failed:', errors);
  return {sent: false, errors};
}
