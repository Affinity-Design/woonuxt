# Brand pages — justify the body copy (theme dev spec)

**Site:** proskatersplace.com (WordPress / WooCommerce, Shoptimizer theme)
**Pages affected:** brand archive pages only — the `pwb-brand` taxonomy, e.g. `/brand/twincam/`, `/brand/rollerblade/`. `<body>` carries the class `tax-pwb-brand` on these pages.
**Request (from Pavel):** the brand description copy currently renders left-aligned and looks unfinished. Change it to **justified** (even on both the left and right margins) for a more professional look. This is presentation only — no content/data changes.

## What to target

There are two blocks of brand copy on these pages:

1. **Intro / short description — above the product grid.** This is the WooCommerce term/archive description. In Shoptimizer it renders inside the products header. Confirm the exact wrapper in the live template; it is one of:
   - `.term-description`
   - `.woocommerce-products-header__description`
   - `.archive-description`
2. **Long-form SEO content — below the product grid.** Injected by our mu-plugin (`psp-brand-content-field.php`) inside a known wrapper: **`.psp-brand-content`** (contains the About/Why-Buy paragraphs, FAQ `<h3>/<p>`, and internal links).

## Implementation

Add to the **Shoptimizer child theme stylesheet** (or Appearance → Customize → Additional CSS if you prefer it managed there). Scope everything to `.tax-pwb-brand` so no other archive is affected.

```css
/* Brand archive pages: justify the brand description copy */
.tax-pwb-brand .psp-brand-content,
.tax-pwb-brand .term-description,
.tax-pwb-brand .woocommerce-products-header__description,
.tax-pwb-brand .archive-description {
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;            /* softens the word gaps justify can create */
}

/* Keep headings, list rows, and the internal-link/category lines left-aligned —
   justify should only affect running paragraph text. */
.tax-pwb-brand .psp-brand-content h2,
.tax-pwb-brand .psp-brand-content h3,
.tax-pwb-brand .psp-brand-content li,
.tax-pwb-brand .psp-brand-content .brand-category-links,
.tax-pwb-brand .psp-brand-content .brand-guide-link {
  text-align: left;
  hyphens: manual;
}
```

### Mobile note (your call)
Full justification on narrow phone columns can open up large word gaps ("rivers"). `hyphens: auto` above reduces this. If it still looks loose under ~480px, left-align on small screens:

```css
@media (max-width: 480px) {
  .tax-pwb-brand .psp-brand-content,
  .tax-pwb-brand .term-description,
  .tax-pwb-brand .woocommerce-products-header__description,
  .tax-pwb-brand .archive-description {
    text-align: left;
  }
}
```

## Acceptance criteria
- On 2–3 brand pages (e.g. `/brand/rollerblade/`, `/brand/powerslide/`), both the intro paragraph(s) above products and the long-form section below products render justified on desktop.
- Headings, FAQ question headings, product/category link rows, and bullet lists remain left-aligned (not justified).
- No other category/shop/archive pages are affected (the rules are scoped to `.tax-pwb-brand`).
- No layout shift or overflow; verified on desktop and mobile.

## Notes
- The below-products block (`.psp-brand-content`) is output by the must-use plugin `wp-content/mu-plugins/psp-brand-content-field.php`. Do **not** add styling there — keep presentation in the theme. The wrapper class is stable; style against it.
- Separately, the brand copy itself is being corrected for contact email and brand-name capitalization via a one-time data script — unrelated to this CSS task.
