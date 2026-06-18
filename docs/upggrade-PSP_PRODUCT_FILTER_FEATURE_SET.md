# PSP Product Filter Feature Set

This document describes the WordPress product filter as human-readable product logic for a Nuxt.js port. It intentionally avoids PHP implementation details and CSS styling. Treat it as the feature contract to reproduce on the sister site.

## Reader And Goal

The reader is a Nuxt.js engineer rebuilding the same shopper experience outside WordPress.

After reading this, they should be able to model the same filter state, decide which filters appear on each listing page, and apply the same result-matching rules.

## Plain-English Summary

The PSP Product Filter is a WooCommerce product-listing filter. It appears on shop, category, brand, tag, custom product taxonomy, and product search listing pages. It shows only the product attributes that are relevant to the current listing page, lets shoppers narrow the product grid by those attributes, price, and sale status, and keeps the filtered state in the page URL.

The important idea is that filters are scoped to the current listing. On an "Inline Skates" category page, the filter should be built from inline skate products, not from every product in the store.

## Where The Filter Appears

The filter is meant for product listing pages:

- Main shop page.
- Product category pages.
- Product tag pages.
- Brand pages or other product-related taxonomy pages.
- Product search results pages.

The filter should not appear on ordinary content pages, product detail pages, or unrelated search pages.

If the current listing has no useful filter groups, the filter should not render.

In WordPress, it can be placed through the "PSP Product Filter" widget or the `[psp_filter]` shortcode. The current plugin registers `[psp_filter]`; do not assume a separate `[woof]` shortcode exists in the current implementation.

## Core Concepts

### Base Product Set

The base product set is the list of products that belong to the current listing before shopper-selected filters are applied.

Examples:

- On the main shop page, the base product set is all published products.
- On a category page, it is all products in that category. Child categories are included.
- On a tag page, it is all products with that product tag.
- On a brand or custom product taxonomy page, it is all products in that taxonomy term.
- On a product search page, it is all products matching the search term.

Every available filter group is calculated from this base product set.

### Attribute Group

An attribute group is a WooCommerce product attribute, such as Color, Size, Brand, Gender, Wheel Size, or Skating Style.

The filter only creates filter groups from WooCommerce product attributes. Product categories, product tags, and product types are listing contexts, not normal filter groups, unless they also exist as WooCommerce attributes in the product data.

### Term

A term is one selectable value inside an attribute group.

Examples:

- Color: Black.
- Size: 10.
- Brand: Rollerblade.
- Skating Style: Fitness.

Terms are identified by stable slugs in the URL and shown to shoppers by their human-readable names.

## What It Filters

### 1. Product Attributes

The main filter type is WooCommerce product attributes.

For each current listing page, the filter checks every WooCommerce attribute and shows the attribute only if the base product set has at least two unique terms for that attribute.

This prevents useless groups like a category where every product has the same single value.

Examples of attribute groups the WordPress plugin knows how to prioritize:

- Gender.
- Brands or Brand.
- Skating Style.
- Skiing Style.
- Frame Mount.
- Recommended Skill Level.
- Setup.
- Boots Control.
- Boots Fit.
- Boots Comfort.
- Wheel Size (mm).
- Frame Length (mm).
- Wheel Durability.
- Deck Size.
- Length.
- Poles Length.
- Bearing Format.
- Material.
- Color.
- Size or Sizes.
- Categories.
- Visibility.
- Tags.
- Cost.
- Ski Flex.
- Block Bottom.
- Block Right.
- Block Top.
- Group Subcategories.
- Label.
- Hide Link.
- Dropdown With.
- Col Width For Subcategories.
- Width For Subcategories Block.
- Product Types.
- Type.

Unknown attribute groups are still allowed. They appear after the known priority groups in their original order.

### 2. Price Range

The filter includes a price range control when the current listing has a real minimum and maximum price.

The default range is based on the base product set for the current listing. If the shopper has not changed the range, price is not treated as an active filter.

When price is active, products match if their product price range overlaps the selected shopper range. This matters for variable products:

- A product with a minimum price below the selected maximum can match.
- A product with a maximum price above the selected minimum can match.
- The product does not need one single exact price value.

### 3. On Sale

The filter includes an "On Sale" toggle.

When enabled, the product grid is limited to products WooCommerce considers on sale. This sale condition combines with all other selected filters.

### 4. Sorting

Sorting is not itself a filter, but the filter system preserves WooCommerce sorting state.

If a shopper filters by Size and then sorts by Price Low to High, the selected filters remain active. Changing sorting resets pagination back to the first page.

### 5. Pagination

Pagination is not itself a filter, but filtered pagination must preserve active filter state.

If a shopper filters by Color and goes to page 2, page 2 should still be filtered by Color. Changing any actual filter resets pagination back to the first page.

## What It Does Not Do

The current WordPress feature set does not include:

- Live product counts next to each term.
- Disabled zero-result options calculated against the current selected filter combination.
- Color swatches or image swatches.
- Product category filtering as a normal checkbox group, unless category-like values are stored as product attributes.
- A visible active filter chip for the price range.
- A large admin settings panel.

These could be added in Nuxt, but they are not part of the current WordPress behavior.

## How Available Filters Are Chosen

Use this logic to build the visible filter sidebar:

1. Start with the current listing page.
2. Find the base product set for that page, ignoring any selected shopper filters.
3. For every product attribute in the catalog, collect the terms assigned to products in the base product set.
4. Remove duplicate terms.
5. Hide the whole attribute group if it has fewer than two unique terms.
6. Sort terms alphabetically by term name.
7. Sort groups by the priority list above.
8. Render the remaining groups.

Important Nuxt port decision: the WordPress filter list is based on the base listing, not the currently filtered result set. If a shopper selects "Black", the available groups and terms do not shrink to only options that still match Black. The product grid changes, but the filter menu remains scoped to the original listing.

## How Products Match Filters

The matching logic is:

- The current listing context always applies first.
- Within one attribute group, multiple selected terms use OR by default.
- Across different attribute groups, selections combine with AND.
- Price range combines with AND.
- On Sale combines with AND.
- Search query combines with AND.

Example:

Shopper is on the Inline Skates category and selects:

- Color: Black, Blue.
- Size: 10.
- On Sale: yes.
- Price: $100 to $300.

Human-readable matching:

Show products that are in Inline Skates AND have Color Black OR Blue AND have Size 10 AND are on sale AND overlap the $100 to $300 price range.

The WordPress URLs can technically represent AND logic within a single attribute group, but the current shopper UI always creates OR logic inside each group.

## URL State Contract

The filter state lives in the URL so pages are shareable, crawlable, and restorable through browser back/forward.

Attribute filters use this pattern:

```text
filter_pa_{attributeSlug}=term-slug,other-term-slug
query_type_pa_{attributeSlug}=or
```

Examples:

```text
?filter_pa_color=black,blue&query_type_pa_color=or
?filter_pa_size=10&query_type_pa_size=or
```

Price uses:

```text
min_price=100
max_price=300
```

On Sale uses:

```text
on_sale=1
```

Sorting uses WooCommerce's normal sorting parameter:

```text
orderby=price
```

Pagination may use normal WordPress or WooCommerce pagination state, such as:

```text
paged=2
product-page=2
```

Nuxt does not need to copy these exact parameter names unless compatibility with WordPress URLs matters. If compatibility matters, keep them exactly.

## URL Update Rules

When a shopper changes an attribute, price, or on-sale filter:

- Rebuild the URL from the current selected controls.
- Preserve unrelated URL parameters, such as search, product type, and sorting.
- Remove pagination parameters so the shopper returns to page 1.
- Add only changed price bounds. If the selected minimum equals the listing minimum, omit `min_price`. If the selected maximum equals the listing maximum, omit `max_price`.
- Add `on_sale=1` only when the sale toggle is on.

When a shopper changes sorting:

- Preserve active filters.
- Set or remove the sorting parameter.
- Remove pagination so sorting starts on page 1.

When a shopper clicks pagination:

- Preserve active filters.
- Preserve sorting.
- Navigate to the requested page.

When a shopper clicks "Clear All":

- Remove all attribute filters.
- Remove all attribute query types.
- Remove price filters.
- Remove the on-sale filter.
- Preserve unrelated parameters, such as search and sorting.
- Return to the base listing URL plus any preserved parameters.

## Shopper Interface Behavior

The WordPress filter has these user-facing parts:

- Active Filters area.
- Clear All link.
- Active chips for selected attribute terms.
- Active chip for On Sale.
- Price range control.
- On Sale toggle.
- Collapsible attribute groups.
- Multi-select checkboxes inside each attribute group.
- Show Results button for mobile drawer usage.

The first attribute group opens by default. Any group with an active selected term also opens by default. The price group opens by default.

Price can be changed with range controls or number inputs. Number input changes are delayed briefly before navigation to avoid firing on every keystroke.

The active filter area appears when any attribute, price, or on-sale filter is active. Current WordPress behavior does not render a separate price chip, even though price makes the filter active and is cleared by Clear All.

## Desktop Versus Mobile Behavior

On desktop, changes apply immediately:

- Checking a box navigates to the new filtered state.
- Toggling On Sale navigates to the new filtered state.
- Changing price navigates after the value is committed or the number input delay finishes.

On mobile, the filter is expected to live in Shoptimizer's filter drawer. When the drawer is open, changes are staged until the shopper taps Show Results.

When Show Results is tapped:

- The drawer closes.
- The URL updates.
- The product grid updates.

Clear All and individual remove actions also close the drawer when used from the mobile drawer.

## Page Update Behavior

The WordPress implementation uses a progressive enhancement approach:

- Filter URLs load full server-rendered product listing pages.
- JavaScript improves the experience by fetching the new page in the background.
- The browser URL updates with history state.
- Browser back and forward reload the matching filtered state.
- If the background request fails, the browser falls back to a normal page navigation.

The visible page sections that update after filtering are:

- Product grid.
- Filter sidebar.
- Result count.
- Breadcrumb.
- Page title.
- Pagination.
- Sorting control.
- Browser document title.

For Nuxt, the equivalent behavior can be route-driven state plus API or server-rendered data fetching. The key feature is not the fetch method; it is that the URL is the source of truth.

## SEO-Related WordPress Behavior

Some SEO behavior lives in the WordPress child theme rather than inside the product filter plugin, but it is part of the full WordPress experience.

When filters are active:

- Filtered pages are still real URLs.
- The archive description is hidden so filtered pages do not show broad category copy that may no longer match the narrowed result set.
- Page title, meta title, meta description, H1, and social preview text can include the first one or two selected filter labels.
- Breadcrumb schema can include active filter labels.
- CollectionPage schema can describe the filtered listing.
- Deep filter combinations are treated differently from shallow ones.

The current SEO rule for depth is based on the number of active filter dimensions, not the number of selected terms inside a single dimension:

- One or two active filter dimensions can stay indexable.
- Three or more active filter dimensions get `noindex, follow`.
- Three or more active filter dimensions use the base category or taxonomy URL as canonical when possible.

With the current product filter plugin active, attribute groups, price, and On Sale all count as active filter dimensions. If the plugin is disabled and only the child-theme fallback runs, depth detection falls back to attribute URL parameters only.

## Caching And Freshness Behavior

Filtered pages should not serve stale or unfiltered product grids.

In WordPress:

- Filtered pages opt out of page caching.
- Background filter requests ask caches not to serve stale content.
- Product changes, trash/delete events, and stock status changes trigger cache purge hooks.
- The plugin is aware of common WordPress cache layers such as FlyingPress, LiteSpeed, and Cloudflare.

For Nuxt, copy the intent, not the WordPress cache integrations:

- Cache listing data carefully by full route and query state.
- Invalidate listing/filter data when product attributes, prices, sale status, stock status, or archive membership changes.
- Avoid serving a cached unfiltered listing for a filtered URL.

## Data Needed For A Nuxt Port

A Nuxt implementation needs these product fields or equivalent derived data:

- Product ID.
- Published/visible status.
- Product categories.
- Product tags.
- Brand or custom taxonomy membership.
- Searchable product text.
- Attribute groups with stable group slugs and display labels.
- Attribute terms with stable term slugs and display names.
- Product minimum price.
- Product maximum price.
- On-sale status.
- Sorting fields used by the storefront.
- Pagination metadata.

For each listing route, Nuxt should be able to answer:

- Which products are in the base product set?
- Which attribute groups have at least two terms in that base set?
- Which terms belong to each visible group?
- Which products match the current selected filters?
- What are the min and max prices for the base product set?

## Porting Checklist

- The filter only appears on product listing routes.
- The visible filter groups are scoped to the current listing, not the whole catalog.
- Attribute groups with fewer than two terms are hidden.
- Terms are sorted alphabetically.
- Known filter groups use the PSP priority order.
- Unknown filter groups still render after known groups.
- Multiple terms in one group use OR.
- Different groups combine with AND.
- Price combines with AND.
- On Sale combines with AND.
- Search and archive context remain active while filtering.
- Filter changes reset pagination to page 1.
- Sorting preserves filters and resets pagination.
- Pagination preserves filters and sorting.
- Clear All removes attribute, price, and sale filters while preserving unrelated route state.
- Shared filtered URLs render the correct product list on first load.
- Browser back and forward restore the correct product list.
- Mobile drawer changes wait for Show Results.
- No live term counts are required for parity.
- No PHP, WordPress widget behavior, or CSS styling is required for parity.
