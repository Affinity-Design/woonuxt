# PSP Cross-Domain Hreflang (.com ↔ .ca)

**Version 1.0.0 · 2026-07-23 · single-file plugin, Rank Math compatible**

Emits the proskatersplace.com half of the cross-domain hreflang cluster:

| Page type | en-us (self) | en-ca | x-default |
| --- | --- | --- | --- |
| Homepage | `proskatersplace.com/` | `proskatersplace.ca/` | .com |
| Product | permalink | `.ca/product/<slug>` | .com |
| product_cat archive | term link | `.ca/product-category/<slug>` | .com |

Everything else (brand pages, blog, cart, paginated/filtered archives, search, 404) emits nothing — no .ca equivalent exists, and wrong tags are worse than none.

The **.ca half** shipped 2026-07-23 in the WooNuxt frontend (`useCanadianSEO.ts`, commit `0c2c8388`): every .ca page now return-links `en-us` to the real .com URL. Until this plugin is active on .com, Google ignores the cluster (missing return tags) — **install it promptly after any .ca deploy of that commit**.

## Install

1. Zip: `wp-admin → Plugins → Add New → Upload Plugin → psp-hreflang.zip → Activate` ("PSP Cross-Domain Hreflang").
2. Or paste the contents of `psp-hreflang.php` (below the plugin header) into a new Code Snippets snippet, run everywhere.

No settings. Disable programmatically with `add_filter('psp_hreflang_enabled', '__return_false');`.

## Design notes

- **Rank Math:** emits no hreflang of its own — zero overlap. Canonicals stay Rank Math's.
- **Translation plugin tags** (`en`/`fr`/`es`/`de`/`pt`) are left untouched; this plugin only adds values they don't emit.
- **Trailing slashes:** .ca targets are slash-less to byte-match the .ca pages' canonicals.
- **Staging-safe:** the .com self URL is normalized to `https://proskatersplace.com` even when rendered on `test.` — staging can never leak into the cluster.
- Skips `is_paged()`, search, 404.

## Validation (2026-07-23)

**Functional (real PHP 8 via php-wasm, WP APIs stubbed): 8/8 checks pass** — correct 3-tag cluster on front page / product / category, slash-less .ca targets, staging host normalized out, zero output on paged/unmapped pages. Harness: session scratchpad `test-plugin.mjs`.

**Live URL mapping:**

- 8/8 random .com product slugs from `product-sitemap1.xml` return **200** at `proskatersplace.ca/product/<slug>`.
- 63/63 .com `product_cat` terms resolve at `proskatersplace.ca/product-category/<slug>` (roller-skates needed a cache-warming retry; `2023-products` 301s on .com itself so its archive never renders and the plugin never fires there).
- 62/63 term paths byte-identical between the .ca frontend's `data/us-category-paths.json` and the .com sitemap — the two sides emit mirror-image URLs.
- **.ca return tags confirmed live in production** (2026-07-23 deploy): .ca homepage, category pages, and product pages each emit exactly one `en-ca`/`en-us`/`x-default` set, with product `en-us` pointing at the real nested .com permalink.

## Verify after activating

```
curl -s https://proskatersplace.com/ | grep hreflang
curl -s https://proskatersplace.com/shop/inline-skating/inline-skates/fr-fr1-80-black-urban-inline-skates/ | grep hreflang
curl -s https://proskatersplace.com/products/inline-skating/inline-skates/ | grep hreflang
```

Expect exactly three tags (en-us, en-ca, x-default) added on each, alongside the translation plugin's existing en/fr/es tags. Then, over the following weeks, watch GSC → International Targeting / the .ca's Canada impressions for cluster pickup.
