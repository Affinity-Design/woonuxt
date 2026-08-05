// Store-to-self email sender. Provider chain, first configured+working one wins:
//   1. EMAIL_SENDER Service binding -> workers/email-sender (send_email binding lives there —
//      Pages projects can't hold one directly). Tokenless; needs the binding added on the
//      Pages project + a redeploy.
//   2. Cloudflare Email Sending REST API — same delivery pipeline, needs an API token with
//      "Email Sending: Edit" (kept as an alternative since account permissions may not allow
//      minting that token).
//   3. SendGrid (legacy fallback).
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
  provider?: 'cloudflare-worker' | 'cloudflare-rest' | 'sendgrid';
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
      errors.push(`email-sender Worker responded ${response.status}: ${data?.code || ''} ${data?.error || 'unknown error'}`.trim());
    } catch (error: any) {
      errors.push(`email-sender Worker call failed: ${error?.message || 'unknown error'}`);
    }
  } else {
    errors.push('EMAIL_SENDER service binding not present');
  }

  // --- 2. Cloudflare Email Service REST API ---
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

      errors.push(`Cloudflare Email API returned success=false: ${JSON.stringify(response?.errors || [])}`);
    } catch (error: any) {
      const apiErrors = error?.data?.errors ? JSON.stringify(error.data.errors) : error?.message || 'unknown error';
      errors.push(`Cloudflare Email API request failed: ${apiErrors}`);
    }
  } else {
    errors.push('Cloudflare email not configured (needs CF_ACCOUNT_ID, CF_EMAIL_API_TOKEN, CF_EMAIL_FROM)');
  }

  // --- 3. SendGrid (legacy fallback) ---
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
