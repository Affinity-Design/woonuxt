# Wordfence 2FA passthrough for the headless (WooNuxt) login

## Problem

Wordfence Login Security enforces 2FA inside WordPress's `authenticate` filter chain, which also
runs for the WPGraphQL headless-login mutation the Nuxt frontend uses. On wp-login.php Wordfence
reads the code from the posted `wfls-token` form field — but a GraphQL request is a **JSON body**,
so `$_POST` is empty and Wordfence never sees a token. Result: any account with 2FA enabled
(admins) cannot log into the Nuxt frontend at all.

## Design

The Nuxt login form has a "2FA code" field (root override `components/forms/LoginAndRegister.vue`).
When filled, the code travels **appended to the password** as:

```
<password>#wfls#<code>
```

No new header → no CORS changes. On the WordPress side, the snippet below runs before WPGraphQL
executes: it splits the marker off the password and exposes the code as `$_POST['wfls-token']` —
exactly where Wordfence looks. **Wordfence still performs all validation** (TOTP time window,
recovery codes, rate limiting). This transports the code; it never bypasses 2FA.

Accounts without 2FA are unaffected (no marker → nothing happens). A real password that ends in
`#wfls#` + 6–32 alphanumerics is the only theoretical collision — practically impossible, and it
would only strip that suffix on login attempts.

## WordPress snippet (add to the psp master snippet / Code Snippets, run everywhere)

```php
/**
 * Headless (WooNuxt) Wordfence 2FA passthrough.
 *
 * The Nuxt login sends "<password>#wfls#<code>" because GraphQL JSON bodies never populate
 * $_POST, so Wordfence Login Security would otherwise never receive a 2FA token. Split the
 * marker off the password before WPGraphQL executes and expose the code where Wordfence
 * reads it ($_POST['wfls-token']). Wordfence still performs the actual validation.
 */
add_filter('graphql_request_data', function ($data) {
    if (isset($data['variables']['password']) && is_string($data['variables']['password'])) {
        if (preg_match('/^(?<pass>.*)#wfls#(?<code>[A-Za-z0-9 ]{6,32})$/s', $data['variables']['password'], $m)) {
            $data['variables']['password'] = $m['pass'];
            $_POST['wfls-token']    = $m['code'];
            $_REQUEST['wfls-token'] = $m['code'];
        }
    }
    return $data;
}, 5);
```

## Test plan

1. Deploy the frontend (branch `test`) and add the snippet to the WP backend serving `BASE_URL`.
2. Log into the Nuxt site with the 2FA-enabled admin account, filling the 2FA field with the
   current authenticator code → should log in, and the my-account **Admin** section appears.
3. Same login with a WRONG code → must fail (proves Wordfence is still validating).
4. Same login with an EMPTY code → must fail with the 2FA-required message (the form highlights
   the 2FA field via its error-detection regex).
5. A normal customer (no 2FA) logs in with the field empty → unchanged behaviour.

## Fallback (only if the snippet doesn't take)

If Wordfence's request wrapper reads the original request instead of the runtime `$_POST`
(plugin-version dependent), switch transports: send the code as an `x-wfls-token` request header
from the frontend and map it in the snippet via `$_SERVER['HTTP_X_WFLS_TOKEN']` instead. That
variant additionally requires allowing the header in the WPGraphQL CORS config
(`Access-Control-Allow-Headers`), which is why the password-marker transport is the default.

## Alternative (no code at all)

A dedicated `shop_manager` service account with 2FA not activated (viable only if the Wordfence
role policy for shop managers is "optional", not "required") — weaker security, zero moving parts.
