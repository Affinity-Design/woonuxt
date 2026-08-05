// psp-email-sender: relays store-to-self emails through the send_email binding.
// Pages can't hold this binding type, so the Nuxt app calls us via a Service binding.
// Security model: no public URL (workers_dev: false, no routes) + destination-locked
// binding — even a compromised caller can only mail the store's own inbox.

interface SendEmailBinding {
  send(message: Record<string, unknown>): Promise<{messageId?: string}>;
}

interface Env {
  EMAIL: SendEmailBinding;
  EMAIL_FROM: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({success: false, error: 'POST only'}, {status: 405});
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return Response.json({success: false, error: 'Invalid JSON body'}, {status: 400});
    }

    const {subject, text, html, replyTo} = payload || {};
    if (typeof subject !== 'string' || !subject.trim() || typeof text !== 'string' || !text.trim()) {
      return Response.json({success: false, error: 'subject and text are required'}, {status: 400});
    }

    try {
      const result = await env.EMAIL.send({
        // `to` omitted on purpose: the binding's destination_address fills it in and
        // rejects any other recipient.
        from: {email: env.EMAIL_FROM, name: 'ProSkaters Place'},
        subject,
        text,
        ...(typeof html === 'string' && html ? {html} : {}),
        ...(typeof replyTo === 'string' && replyTo ? {replyTo} : {}),
      });
      return Response.json({success: true, messageId: result?.messageId});
    } catch (error: any) {
      // error.code is an E_* code from the binding (e.g. E_SENDER_NOT_VERIFIED).
      return Response.json({success: false, code: error?.code, error: error?.message || 'send failed'}, {status: 502});
    }
  },
};
