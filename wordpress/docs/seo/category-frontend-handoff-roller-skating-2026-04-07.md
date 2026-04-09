# Roller Skating Category Frontend Handoff

Observed: 2026-04-07
Target URL: https://proskatersplace.com/products/roller-skating/
Audience: frontend agent implementing changes in the live WordPress child theme

## Goal

Make the live product category archive output the SEO content that already exists in WordPress term fields, and align the page with current Google ecommerce/category-page best practices.

This is not a content-generation problem anymore.

- The category optimizer successfully writes description, below-content, Rank Math term meta, and FAQ schema data.
- The public archive currently fails to render key editorial content and fails to output several important head tags.

## Confirmed Live Facts

These were verified against the live page and the live WordPress term/meta API for product_cat term `2524` (`roller-skating`).

### Public page currently does right

- Canonical URL is correct: `https://proskatersplace.com/products/roller-skating/`
- H1 is correct: `Roller Skating`
- Subcategory links now use canonical `/products/...` URLs
- Product pagination is crawlable with real `<a href>` links
- Lab performance is already good enough for SEO triage:
  - LCP about `551ms`
  - CLS `0.00`

### Public page currently does wrong

- No rendered editorial intro is visible in page HTML
- No rendered below-category content is visible in page HTML
- No rendered FAQ section is visible in page HTML
- No `<meta name="description">`
- No `og:description`
- No `twitter:description`
- `og:type` is `article`, which is a poor fit for a category archive
- `twitter:image` does not match the roller-skating category image
- `twitter:data1` product count is stale/inaccurate for this page
- Mixed-content font requests are firing over `http://` and being blocked on the HTTPS page

### Stored data that already exists in WordPress

Verified live term/meta values:

- `description`: present, length `733`
- `below_category_content`: present, length `8131`
- `second_desc`: present, length `8131`
- `seconddesc`: present, length `8131`
- `cat_second_desc`: present, length `8131`
- `bottom_description`: present, length `8131`
- `rank_math_title`: present, length `58`
- `rank_math_description`: present, length `157`
- `psp_cat_schema`: present, length `3150`

Conclusion: this is a child-theme rendering/head-output gap, not a pipeline data gap.

## Highest-Impact Implementation Changes

### 1. Render the category editorial content on the archive page

This is the biggest missing SEO asset.

Requirements:

- Keep the core category name/H1 as-is
- Show the short description near the top of the archive, above the product grid if the theme currently suppresses it
- Show the long-form below-category content below the loop or below pagination
- Prefer `below_category_content`, but support the existing alias fallback chain:
  - `below_category_content`
  - `second_desc`
  - `seconddesc`
  - `cat_second_desc`
  - `bottom_description`

Implementation note:

- The content is already stored and sanitized by the category bridge
- The child theme should read and render it, not regenerate it

### 2. Output proper meta/snippet tags for product category archives

Requirements for product category pages:

- Output `<meta name="description">` from `rank_math_description`
- Output `og:description` from the same source
- Output `twitter:description` from the same source
- Use the term image as the social image if available
- Keep the self-canonical URL

Suggested field priority:

- Title: `rank_math_title`, then fall back to the term name if empty
- Description: `rank_math_description`, then fall back to a trimmed plain-text version of the term description
- Image: term thumbnail/image if available

### 3. Fix social metadata mismatches

Current issues observed:

- `og:type` is `article`
- `twitter:image` is unrelated to the category
- Twitter count/value data is stale

Implementation target:

- Use `og:type=website` or a consistent archive-safe value for category pages
- Ensure `og:image` and `twitter:image` both reference the actual category image
- Remove or update stale twitter count metadata if the source is unreliable

### 4. Render visible FAQ content and emit matching FAQ schema only if visible

Current state:

- `psp_cat_schema` exists in term meta
- FAQ JSON-LD is not present on the public page
- FAQ content is also not visibly rendered on the page

Requirements:

- If you render the FAQ block visibly on the page, output matching FAQPage JSON-LD
- If the theme chooses not to render the FAQ block, do not emit FAQ schema

This keeps schema aligned with visible content and avoids low-trust structured-data usage.

### 5. Make the main title/meta set more category-specific

Current live title:

- `Roller / Quad Skating - Derby, Dance, Jam, and Fun skating`

Recommended direction:

- Make title clearer, more descriptive, and better aligned with the actual category inventory and H1
- Keep it concise and commercially specific

One acceptable example:

- `Roller Skating | Quad Skates, Derby Gear, Wheels & Parts | ProSkaters Place`

One acceptable meta description direction:

- `Shop roller skating gear including quad skates, roller derby gear, wheels, bearings, toe stops, and parts. Expert help, top brands, and fast US shipping.`

### 6. Clean mixed-content and low-value frontend noise

Observed live issues:

- blocked `http://` Elementor font requests on an HTTPS page
- wishlist/admin AJAX noise on archive load

Priority:

- lower than rendering/meta fixes
- still worth cleaning because it reduces noise and fragility

## Field Map For The Child Theme

Use these fields as the source of truth on `is_product_category()` pages:

| Purpose                     | Preferred source                             |
| --------------------------- | -------------------------------------------- |
| H1                          | current taxonomy name                        |
| Intro above products        | taxonomy `description`                       |
| Long content below products | `below_category_content` with alias fallback |
| SEO title                   | `rank_math_title`                            |
| SEO description             | `rank_math_description`                      |
| FAQ schema                  | `psp_cat_schema`                             |
| Social image                | category term thumbnail/image                |

## Acceptance Criteria

The implementation should be considered correct only when all of these are true on the public page:

1. The archive visibly renders unique editorial intro content.
2. The archive visibly renders the long-form below-category content.
3. The archive has a real meta description in the page head.
4. The archive has `og:description` and `twitter:description`.
5. Social image matches the actual roller-skating category image.
6. Title/meta match the category instead of generic or stale archive text.
7. FAQ schema is emitted only if the FAQ content is visibly present on-page.
8. No `/product-category/` URLs appear in the page source.
9. Mixed-content font errors are gone.

## Repo Artifacts To Use

Reference implementation notes and helpers created in this repo:

- `wordpress/psp-category-seo-code-snippet.php`
- `wordpress/mu-plugins/psp-category-content-field.php`
- `wordpress/psp-category-archive-seo-child-theme-reference.php`
- `wordpress/docs/category-frontend-retest-checklist.md`

## Recommended Implementation Order

1. Render intro and below-content in the child theme.
2. Output taxonomy meta description and social descriptions.
3. Fix title and social image handling for category archives.
4. Render FAQ block and then emit matching FAQ schema.
5. Clean mixed-content font URLs and optional plugin noise.
