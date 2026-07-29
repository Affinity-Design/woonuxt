# Checkout-only account registration

## Incident finding

On July 29, 2026, the shared WordPress backend accepted standalone registrations even though the intended business policy was checkout-only account creation.

Live read-only checks confirmed all three public registration surfaces were open:

- `https://proskatersplace.com/wp-login.php?action=register` rendered the WordPress registration form.
- `https://proskatersplace.com/my-account/` rendered the WooCommerce registration form.
- `https://proskatersplace.com/graphql` exposed both `registerUser` and `registerCustomer` mutations.

The mixed bogus roles match those paths: WordPress core registration creates Subscribers, while WooCommerce registration creates Customers. Turnstile was rendered on the forms, but that did not enforce the required rule that user creation must be coupled to an order.

## Enforced policy

`wordpress/mu-plugins/psp-checkout-only-registration.php` provides the backend control shared by the US and Canadian frontends:

- forces WordPress public registration off;
- forces WooCommerce My Account registration off;
- removes `registerUser` and `registerCustomer` from `RootMutation`;
- rejects native and WooCommerce registration calls as a backstop;
- permits WooCommerce customer creation only in classic checkout, Store API checkout, WooGraphQL checkout, WP-CLI, or an authenticated WooCommerce administration request;
- logs blocked attempts without usernames or email addresses.

The Nuxt account page no longer offers standalone registration. The Turnstile secret is server-only runtime configuration.

## Deploy immediately

1. Copy `wordpress/mu-plugins/psp-checkout-only-registration.php` to `wp-content/mu-plugins/` on the shared `proskatersplace.com` WordPress installation.
2. In WordPress Settings > General, clear **Anyone can register**.
3. In WooCommerce Settings > Accounts & Privacy, clear **Allow customers to create an account on the My account page**. Keep checkout account creation enabled only if required.
4. Purge the WordPress object cache and any WPGraphQL schema cache.
5. Deploy the Nuxt build to `proskatersplace.ca`.
6. Rotate the Cloudflare Turnstile secret after the Nuxt deployment. The prior Nuxt configuration placed it in public runtime config, so treat the old secret as exposed.

## Post-deploy verification

- `GET /wp-login.php?action=register` says registration is disabled and does not render `registerform`.
- `/my-account/` does not render `woocommerce-form-register`.
- GraphQL schema introspection does not contain `registerUser` or `registerCustomer` on `RootMutation`.
- The deployed Nuxt client payload does not contain the Turnstile secret.
- Direct native and WooCommerce registration submissions return `psp_checkout_only_registration` and create no user.
- A real checkout with account creation enabled creates exactly one Customer and exactly one associated order.
- Guest checkout, login, password reset, `.com` checkout, and `.ca` checkout continue to work.

## Incident cleanup

Before deleting suspicious users, export their IDs, creation times, roles, IP/security logs, sessions, application passwords, and linked orders. Revoke all sessions and application passwords for confirmed rogue accounts, then delete accounts with no legitimate orders. Review Wordfence, Cloudflare, web-server, and WP activity logs around the first observed creation time to identify the source path and IP pattern.

Do not use a user agent, Origin, Referer, frontend-only Turnstile check, or hidden form as authorization. Those values are attacker-controlled. The backend registration policy is the enforcement point.
