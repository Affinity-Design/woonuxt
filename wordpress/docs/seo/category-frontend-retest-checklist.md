# Category Frontend Retest Checklist

Use this after child-theme changes are deployed.

Primary test URL for current work:

- `https://proskatersplace.com/products/roller-skating/`

## Public HTML Checks

1. Confirm the page still resolves with HTTP `200`.
2. Confirm canonical is still `https://proskatersplace.com/products/roller-skating/`.
3. Confirm no `/product-category/` URLs exist in page source.
4. Confirm the H1 is still `Roller Skating`.
5. Confirm the short intro is visibly rendered above or near the top of the product grid.
6. Confirm the long-form below-category content is visibly rendered below the loop.
7. Confirm the FAQ section is visibly rendered if FAQ schema is present.

## Head/Metadata Checks

1. Confirm `<title>` is category-specific and not stale/generic.
2. Confirm `<meta name="description">` is present.
3. Confirm `og:title` matches the archive intent.
4. Confirm `og:description` is present.
5. Confirm `twitter:title` is present.
6. Confirm `twitter:description` is present.
7. Confirm `og:image` and `twitter:image` point to the roller-skating category image.
8. Confirm `og:type` is archive-appropriate, not `article`.

## Schema Checks

1. Confirm CollectionPage schema is still present.
2. Confirm FAQPage schema is present only if FAQs are visibly rendered.
3. Confirm FAQ questions in JSON-LD match the visible FAQ section.
4. Confirm breadcrumb data still matches the canonical path.

## Content Quality Checks

1. Confirm the visible editorial content is unique to roller skating and not generic archive filler.
2. Confirm the copy includes relevant category subtopics like quad skates, derby, wheels, bearings, parts, and tools where appropriate.
3. Confirm internal links use canonical `/products/...` URLs.
4. Confirm there are no malformed, placeholder, or obviously wrong category links.

## Frontend Quality Checks

1. Confirm no mixed-content font requests appear in the browser console.
2. Confirm the content placement works on mobile and desktop.
3. Confirm the editorial blocks do not break pagination or filters.
4. Confirm no duplicate H1 or visually competing title blocks were introduced.

## Stored-vs-Rendered Sanity Checks

If something still looks missing on the public page, compare live WordPress storage vs output:

1. `description`
2. `below_category_content`
3. `second_desc`
4. `seconddesc`
5. `cat_second_desc`
6. `bottom_description`
7. `rank_math_title`
8. `rank_math_description`
9. `psp_cat_schema`

## Retest Outcome States

- Pass: all public HTML, metadata, and schema checks are present and aligned.
- Partial pass: content exists but one of meta/social/schema outputs is still missing.
- Fail: stored SEO data exists in WordPress but remains absent from public HTML.
