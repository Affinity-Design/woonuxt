# Brand Archive Page — Design & Template Suggestions

> **Context:** This document is for the LLM/developer managing the WordPress theme and Elementor templates on `proskatersplace.com`. Our brand page SEO automation script (`optimize-brand-page.js`) generates and writes optimized content to three fields per brand. The current Elementor template has conflicts that need resolving.

---

## Current Architecture

### Content Fields (Written by our automation script)

| Field               | Location         | Purpose                                                                                                                                                |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `description`       | WP taxonomy desc | Short intro (80-100 words) with authorized dealer badge. Renders **above** product grid via WooCommerce default template.                              |
| `psp_brand_content` | Term meta        | Full SEO content: 4 H2 sections + FAQ accordion + internal links. Renders **below** product grid via `woocommerce_after_shop_loop` hook (priority 20). |
| `psp_brand_schema`  | Term meta        | FAQPage JSON-LD. Emitted in `<head>` via `wp_head` hook.                                                                                               |

### mu-plugin responsible

`wp-content/mu-plugins/psp-brand-content-field.php` — registers the meta, admin editor, render hooks, and schema output.

---

## Problems Found (Audit of `/brand/micro/`)

### 1. 🔴 CRITICAL: Duplicate Content — Old Elementor Widget

The brand archive Elementor template contains a **text-editor widget** (`data-id="a622969"` on the Micro page) with old, generic AI-generated content ("Micro Skate: The Pinnacle of Skating Excellence"). This content:

- Is **hardcoded in the Elementor template** (not pulled from a meta field we can clear)
- Creates **duplicate content** alongside our optimized `psp_brand_content`
- Contains outdated/fake information (fake customer reviews, generic text)
- Has broken links (e.g., `proskatersplace.com/7-best-inline-skates-for-beginners/e&swcfpc=1`)
- Links to the live `.com` site from the test site

**Fix options (pick one):**

A. **Remove the widget entirely.** Since our `psp_brand_content` replaces it with better, keyword-optimized content, the Elementor widget is no longer needed.

B. **Conditional display.** If some brands haven't been optimized yet and you want to keep the old content as fallback:

```php
// In the Elementor template or via a shortcode/dynamic tag:
$term = get_queried_object();
$has_new_content = get_term_meta($term->term_id, 'psp_brand_content', true);
if (empty($has_new_content)) {
    // Show old Elementor content
}
```

C. **CSS override (temporary, already deployed).** The mu-plugin already injects CSS to hide `.elementor-widget-text-editor` on brand archives when `psp_brand_content` exists. But this is a band-aid — the HTML still loads, wastes bandwidth, and search engines may still index it.

**Recommendation: Option A** (remove the widget). All 76 brands will be optimized by the script. No fallback needed.

---

### 2. 🔴 Duplicate H1 Tags

The page currently has **two H1 elements**:

1. WooCommerce archive title: `<h1 class="woocommerce-products-header__title page-title">Micro</h1>`
2. Elementor widget H1: `<h1>Micro Skate: The Pinnacle of Skating Excellence</h1>`

Multiple H1s is bad for SEO. There should be exactly **one H1** per page.

**Fix:** Remove the H1 from the Elementor widget (it should go away when you remove the widget per issue #1). If you keep the widget, demote the heading to H2 or remove it.

---

### 3. 🟡 Brand Description Area Styling (Above Products)

Our script writes a short description (badge image + 1-2 paragraphs, ~80-100 words) to the WooCommerce taxonomy `description` field. This renders above the product grid.

**Suggested styling:**

```css
/* Brand short description — above product grid */
.tax-pwb-brand .term-description {
  max-width: 800px;
  margin-bottom: 2rem;
  font-size: 1.05rem;
  line-height: 1.7;
  color: #333;
}

/* Authorized dealer badge (inline image in description) */
.tax-pwb-brand .term-description img {
  max-height: 60px;
  width: auto;
  margin-bottom: 0.5rem;
  display: block;
}
```

---

### 4. 🟡 PSP Brand Content Styling (Below Products)

The `psp_brand_content` div renders below the product grid with minimal inline styling. Here's what it contains and how to style it:

**HTML structure:**

```html
<div class="psp-brand-content">
  <h2>About [Brand]</h2>
  <p>...</p>

  <h2>Why Buy [Brand] from ProSkaters Place?</h2>
  <p>...</p>

  <h2>[Brand] Products at ProSkaters Place</h2>
  <p>...</p>
  <ul>
    <!-- category links -->
  </ul>

  <h2>Expert Advice & Resources</h2>
  <p>...</p>
  <ul>
    <!-- internal guide links -->
  </ul>

  <h2>Frequently Asked Questions</h2>
  <div class="psp-faq">
    <div class="psp-faq-item">
      <h3 class="psp-faq-question">Q: ...</h3>
      <div class="psp-faq-answer"><p>A: ...</p></div>
    </div>
    <!-- more FAQs -->
  </div>
</div>
```

**Suggested CSS:**

```css
/* Brand content section — below product grid */
.psp-brand-content {
  max-width: 900px;
  margin: 3rem auto 2rem;
  padding-top: 2rem;
  border-top: 2px solid #f0f0f0;
  font-size: 1rem;
  line-height: 1.75;
  color: #333;
}

.psp-brand-content h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 2.5rem;
  margin-bottom: 0.75rem;
  color: #1a1a1a;
}

.psp-brand-content ul {
  padding-left: 1.25rem;
  margin-bottom: 1rem;
}

.psp-brand-content ul li {
  margin-bottom: 0.4rem;
}

.psp-brand-content a {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.psp-brand-content a:hover {
  color: #1d4ed8;
}

/* FAQ accordion */
.psp-faq {
  margin-top: 1rem;
}

.psp-faq-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.psp-faq-question {
  font-size: 1.05rem;
  font-weight: 600;
  padding: 1rem 1.25rem;
  margin: 0;
  cursor: pointer;
  background: #f9fafb;
  transition: background 0.2s;
}

.psp-faq-question:hover {
  background: #f3f4f6;
}

.psp-faq-answer {
  padding: 0 1.25rem 1rem;
}

.psp-faq-answer p {
  margin: 0;
}
```

**Optional enhancement:** Make FAQs collapsible with JS:

```javascript
document.querySelectorAll('.psp-faq-question').forEach((q) => {
  q.addEventListener('click', () => {
    const answer = q.nextElementSibling;
    answer.style.display = answer.style.display === 'none' ? 'block' : 'none';
  });
});
```

---

### 5. 🟡 Product Grid — Currency Display

Products on the US `.com` site are displaying prices in **CAD** (e.g., `C$199.99`). Since `proskatersplace.com` targets US customers, prices should display in **USD** or at minimum show a clear currency label.

**Note:** This may not be a template issue — it could be a WooCommerce currency setting. Check:

- WooCommerce → Settings → General → Currency → Should be `USD` for the .com site
- If this is a multisite sharing products with the `.ca` store, ensure currency switching is configured

---

### 6. 🟢 Nice-to-Have: Breadcrumbs

Currently no breadcrumbs on brand pages. Adding:

```
Home > Brands > [Brand Name]
```

Would help both UX navigation and SEO (Google shows breadcrumbs in SERPs).

---

### 7. 🟢 Nice-to-Have: Brand Logo/Banner

If PWB has a brand logo image uploaded, display it at the top of the archive (before the description). The meta key is typically `pwb_brand_image`. This adds visual trust signals.

---

## Summary of Actions

| Priority | Issue                           | Action                                                    |
| -------- | ------------------------------- | --------------------------------------------------------- |
| 🔴 P0    | Duplicate old Elementor content | Remove the text-editor widget from brand archive template |
| 🔴 P0    | Duplicate H1 tags               | Remove H1 from Elementor widget (goes away with above)    |
| 🟡 P1    | Brand description styling       | Add CSS for `.term-description` on brand archives         |
| 🟡 P1    | PSP content section styling     | Add CSS for `.psp-brand-content` (see above)              |
| 🟡 P1    | CAD prices on .com              | Check WooCommerce currency settings                       |
| 🟢 P2    | Breadcrumbs                     | Add breadcrumb nav to brand archive template              |
| 🟢 P2    | Brand logo display              | Show PWB brand image at top of archive                    |

---

## Diagnostic Endpoints (for debugging)

The mu-plugin (`psp-brand-content-field.php`) exposes these REST endpoints for inspecting and cleaning up brand meta:

```bash
# List ALL meta keys for a brand term (needs auth)
GET /wp-json/psp/v1/brand-meta/{term_id}

# Delete a specific meta key
DELETE /wp-json/psp/v1/brand-meta/{term_id}/{key_name}

# Auto-clear all known old/orphaned PWB content keys
POST /wp-json/psp/v1/brand-clear-old/{term_id}
```

To find a brand's term_id:

```bash
GET /wp-json/wp/v2/pwb-brand?slug=micro
# Response includes "id": 2514
```
