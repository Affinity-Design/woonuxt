# psp-email-sender

Tiny sidecar Worker that sends the contact-form email through Cloudflare Email Service's
`send_email` binding. It exists because **Cloudflare Pages projects cannot hold a
`send_email` binding** — the Nuxt app reaches this Worker through a Pages **Service
binding** instead. No API token anywhere in the chain.

## Security model

- **No public URL** — `workers_dev: false`, no routes. Only Service-binding callers
  (our Pages projects) can reach it.
- **Destination-locked** — the `send_email` binding pins `destination_address` to the
  store inbox. `send()` omits `to`; any other recipient is rejected by the platform.
- FROM is `noreply@proskatersplace.ca` (`EMAIL_FROM` var) — must stay on a domain with
  Email Routing enabled on this account.

## One-time setup (all tokenless, OAuth via `wrangler login`)

```bash
npx wrangler login
```

```bash
npx wrangler email routing enable proskatersplace.ca
```

```bash
npx wrangler email routing addresses create info@proskatersplace.com
```

Click the verification link Cloudflare emails to that inbox, then deploy from this
directory:

```bash
npx wrangler deploy
```

Note: if `CF_API_TOKEN`/`CLOUDFLARE_API_TOKEN` is set in the environment it overrides the
OAuth login (and it is KV-scoped, so wrangler commands here fail with auth errors) — clear
it for these commands, e.g. `env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN npx wrangler deploy`.

Finally, on **both** Pages projects (test + prod): Settings → Bindings → Add →
**Service binding**, variable name `EMAIL_SENDER`, service `psp-email-sender` → then
redeploy the Pages project (bindings only apply to new deployments).

## Contract

`POST` any URL with JSON `{subject, text, html?, replyTo?}` →
`{success: true, messageId}` or `{success: false, code, error}` (`code` is a platform
`E_*` code, e.g. `E_SENDER_NOT_VERIFIED` = Email Routing not enabled on the FROM domain).

Consumed by `server/utils/emailSender.ts` (provider 1 of 3, ahead of the REST API and
SendGrid fallbacks).
