# Incident: GraphQL schema flapping (2026-08-13)

## Summary

After the WooCommerce 10.7 → 11.0.1 upgrade on the proskatersplace.com backend,
the WPGraphQL schema began intermittently losing all WooGraphQL types
(products, cart, `registerCustomer`, …). WooGraphQL 0.21.1 silently skips its
entire schema registration when the `WooCommerce` class is not loaded at the
moment `graphql_init` fires, and post-upgrade OPcache/object-cache state made
that intermittent per PHP worker.

## Customer impact

- Search index ingested products with `image: null`, crashing the header
  search dropdown and locking up product pages (fixed in PR #12).
- Cart/checkout GraphQL calls from the .ca frontend failed intermittently;
  sessions could be initialized before JWT auth resolved the user.
- Frontend deploys failed or hung whenever build-time schema introspection
  hit a degraded window (builds at 20:02Z and 20:41Z).

## Remediation

- PR #12: null-safe rendering of image-less products (permanent).
- PR #13: temporary client error beacon (remove after incident).
- WordPress Code Snippets (temporary until plugin migration):
  - "PSP TEMP HOTFIX - GraphQL stability patches" (snippet 87): re-inits
    WooGraphQL per-request when registration was skipped; defers WooCommerce
    session/cart init until after JWT auth (backported from WPGraphQL for
    eCommerce v1.0.3).
  - "PSP one-shot OPcache reset": single-use OPcache clear.
- Redis object cache flushed.

## Follow-up (permanent fix)

Coordinated staging migration: WooGraphQL 0.21.1 → WPGraphQL for eCommerce
1.0.3 (breaking schema changes) + WPGraphQL 2.9.1 → 2.17 + frontend query
migration. Requires reviving test.proskatersplace.com (origin down since
2026-08-07, blocking all preview builds). Remove the temporary snippets and
the error beacon once migrated.

## Update 22:15Z

Builds 2 and 3 (20:41Z, 21:57Z) failed identically at codegen introspection
despite the stability snippet being active, while ad-hoc schema probes kept
passing. That pattern implicates WPGraphQL Smart Cache replaying a poisoned
cached response for the (byte-identical) introspection query. Smart Cache
has been deactivated pending the plugin migration; this commit retriggers
the build.
