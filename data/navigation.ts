/**
 * Navigation taxonomy — single source of truth for desktop mega menu,
 * mobile drawer, and category-page top index.
 *
 * Every `slug` here has been verified against live WPGraphQL on
 * 2026-05-28 via `scripts/audit-category-slugs.js`. See
 * `data/category-slugs-audit.txt` for the full reference tree.
 *
 * If you add a slug here, re-run the audit script and confirm the
 * slug exists in WooCommerce — otherwise the link will 404 in prod.
 */

export type NavBadge = 'new' | 'sale' | 'hot';

export interface NavSubItem {
  /** Display label */
  label: string;
  /** WooCommerce category slug (verified). Linked as /product-category/{slug}. Optional when `href` is set. */
  slug?: string;
  /**
   * Full path override. Takes precedence over `slug`. Use for links that aren't a plain
   * category archive — e.g. a filtered attribute archive:
   * `/product-category/inline-skates?filter=pa_style[urban-freeskate-skating]`. The value
   * inside the filter must be the attribute *term slug* — the same value the product's
   * GlobalProductAttribute.options carries and the PillFilter emits (see
   * components/filtering/Filters.vue + useFiltering.ts).
   */
  href?: string;
  /** Optional pill badge rendered next to label */
  badge?: NavBadge;
  /**
   * Iconify icon name (e.g. `mdi:roller-skate`, `ion:cog-outline`).
   * Used by the desktop mega menu and could be reused in the mobile drawer.
   * Falls back to no icon if undefined or if the icon set isn't available.
   */
  icon?: string;
}

export interface NavGroup {
  /** Column heading inside the mega menu / drawer level 1 panel */
  groupTitle: string;
  items: NavSubItem[];
}

export interface NavEditorial {
  label: string;
  description: string;
  linkLabel: string;
  href: string;
}

export interface NavTopLevel {
  /** Top-level nav label */
  label: string;
  /** Parent category slug, also the "Shop All" destination */
  slug: string;
  /** Featured image (relative to /public). Reuses existing category imagery. */
  image: string;
  imageAlt: string;
  /** Headline rendered over/beside the featured image */
  headline: string;
  /** Optional right-rail callout */
  editorial?: NavEditorial;
  /** Optional direct category link shown before groups in the mobile drawer */
  mobileDirectLink?: NavSubItem;
  /** Subcategory groups for the panel columns */
  groups: NavGroup[];
}

export const navigation: NavTopLevel[] = [
  {
    label: 'Inline Skating',
    slug: 'inline-skating',
    image: '/images/Inline-Skating.jpeg',
    imageAlt: 'Inline skates for fitness, urban, and off-road',
    headline: 'Built for speed,\ncontrol & style.',
    mobileDirectLink: { label: 'Inline Skates', slug: 'inline-skates' },
    editorial: {
      label: 'Not sure on size?',
      description: 'Use our free size calculator to find your perfect fit.',
      linkLabel: 'Try the Size Calculator',
      href: '/roller-skates-size-calculator',
    },
    groups: [
      {
        groupTitle: 'Skating Style',
        items: [
          { label: 'Inline Skates', slug: 'inline-skates', icon: 'mdi:roller-skate' },
          // Shop-by-style links → inline-skates category pre-filtered on the pa_style attribute.
          // The filter value is the pa_style term slug, which is exactly what the product's
          // GlobalProductAttribute.options carries and what the PillFilter emits — so these
          // reproduce a click on the style pill. (Verified against live data: these are the
          // full term slugs like `urban-freeskate-skating`, NOT the short label.)
          { label: 'Urban', href: '/product-category/inline-skates?filter=pa_style[urban-freeskate-skating]', icon: 'mdi:city-variant-outline' },
          { label: 'Fitness', href: '/product-category/inline-skates?filter=pa_style[fitness-recreational-skating]', icon: 'mdi:heart-pulse' },
          { label: 'Aggressive', href: '/product-category/inline-skates?filter=pa_style[aggressive-and-skate-park]', icon: 'mdi:lightning-bolt-outline' },
          { label: 'Freestyle', href: '/product-category/inline-skates?filter=pa_style[freestyle-and-slalom-skating]', icon: 'mdi:cone' },
          { label: 'Marathon', href: '/product-category/inline-skates?filter=pa_style[marathon-and-long-distance-skating]', icon: 'mdi:map-marker-distance' },
        ],
      },
      {
        groupTitle: 'Parts & Upgrades',
        items: [
          { label: 'Inline Frames', slug: 'inline-frames', icon: 'mdi:car-shift-pattern' },
          { label: 'Frame Sets', slug: 'complete-frame-sets', icon: 'mdi:link-variant' },
          { label: 'Wheels', slug: 'inline-skate-wheels', icon: 'mdi:circle-double' },
          { label: 'Bearings', slug: 'inline-skate-bearings', icon: 'ion:cog-outline' },
          { label: 'Heel Brakes', slug: 'skate-heel-brakes', icon: 'mdi:car-brake-abs' },
          { label: 'Liners', slug: 'inline-skate-liners', icon: 'mdi:tshirt-crew-outline' },
        ],
      },
      {
        groupTitle: 'Accessories',
        items: [
          { label: 'Color Kits & Laces', slug: 'color-kits-laces', icon: 'mdi:palette-outline' },
          { label: 'Skate Tools', slug: 'skate-tools', icon: 'mdi:tools' },
          { label: 'All Replacement Parts', slug: 'replacement-parts', icon: 'mdi:cube-outline' },
        ],
      },
    ],
  },
  {
    label: 'Roller Skating',
    slug: 'roller-skating',
    image: '/images/Roller-Skating.jpeg',
    imageAlt: 'Quad roller skates and derby gear',
    headline: 'Quad skates,\nfrom rink to derby.',
    mobileDirectLink: { label: 'Roller Skates', slug: 'roller-skates' },
    editorial: {
      label: 'New to roller?',
      description: 'Our roller size calculator narrows the fit in 60 seconds.',
      linkLabel: 'Try the Size Calculator',
      href: '/roller-skates-size-calculator',
    },
    groups: [
      {
        groupTitle: 'Skating Style',
        items: [
          { label: 'Quad Roller Skates', slug: 'roller-skates', icon: 'mdi:roller-skate' },
          { label: 'Derby Skates', slug: 'roller-derby', icon: 'mdi:speedometer' },
          // Shop-by-style links → roller-skates category pre-filtered on pa_style.
          // Values are the pa_style term slugs (what GlobalProductAttribute.options carries).
          // Roller has only these style terms; Derby is left as the category link above.
          { label: 'Recreational', href: '/product-category/roller-skates?filter=pa_style[recreational]', icon: 'mdi:emoticon-happy-outline' },
          { label: 'Dance', href: '/product-category/roller-skates?filter=pa_style[dance-jam]', icon: 'mdi:music' },
          { label: 'Aggressive', href: '/product-category/roller-skates?filter=pa_style[aggressive-and-skate-park]', icon: 'mdi:lightning-bolt-outline' },
        ],
      },
      {
        groupTitle: 'Parts & Upgrades',
        items: [
          { label: 'Plates & Parts', slug: 'roller-skate-parts', icon: 'ion:layers-outline' },
          { label: 'Wheels', slug: 'roller-skate-wheels', icon: 'mdi:circle-double' },
          { label: 'Bearings', slug: 'roller-skate-bearings', icon: 'ion:cog-outline' },
          { label: 'Tools', slug: 'roller-skate-tool', icon: 'mdi:tools' },
        ],
      },
      {
        groupTitle: 'Accessories',
        items: [
          { label: 'Color Kits & Laces', slug: 'color-kits-laces', icon: 'mdi:palette-outline' },
          { label: 'Skate Tools', slug: 'skate-tools', icon: 'mdi:tools' },
          { label: 'All Replacement Parts', slug: 'replacement-parts', icon: 'mdi:cube-outline' },
        ],
      },
    ],
  },
  {
    label: 'Protection & Apparel',
    slug: 'protection-gear-and-apparel',
    image: '/images/Protection-Gear.jpeg',
    imageAlt: 'Helmets, pads, wrist guards and protective apparel',
    headline: 'Skate safer.\nFrom helmets to socks.',
    editorial: {
      label: 'Kids gear?',
      description: 'See our full kids skating collection — apparel, pads & skates.',
      linkLabel: 'Shop Kids Products',
      href: '/product-category/children-products',
    },
    groups: [
      {
        groupTitle: 'Protection',
        items: [
          { label: 'Helmets', slug: 'protective-helmets', icon: 'mdi:racing-helmet' },
          { label: 'Knee & Elbow Pads', slug: 'knee-and-elbow-pads', icon: 'mdi:shield-half-full' },
          { label: 'Wrist Guards', slug: 'gloves-wrist-protection', icon: 'mdi:hand-front-left-outline' },
          { label: 'Protection Packs', slug: 'protection-packs', icon: 'mdi:shield-check-outline' },
          { label: 'Protective Shorts', slug: 'protective-shorts', icon: 'mdi:tshirt-crew-outline' },
        ],
      },
      {
        groupTitle: 'Apparel & Bags',
        items: [
          { label: 'Socks & Foot Care', slug: 'socks-foot-care', icon: 'mdi:foot-print' },
          { label: 'Backpacks & Bags', slug: 'backpacks-bags-carriers', icon: 'mdi:bag-personal-outline' },
          { label: 'Accessories', slug: 'accessories', icon: 'mdi:cube-outline' },
        ],
      },
    ],
  },
];

/**
 * SALE / Clearance — standalone link, not a panel.
 * Rendered with red treatment in MainMenu.
 */
export const saleNavItem = {
  label: 'SALE',
  slug: 'clearance-items',
  href: '/product-category/clearance-items',
};

/**
 * Auxiliary links shown in the mobile drawer root level
 * (below the category list).
 */
export const auxNavItems: { label: string; href: string }[] = [
  { label: 'Blog', href: '/blog' },
  { label: 'Size Calculator', href: '/roller-skates-size-calculator' },
  { label: 'New Arrivals', href: '/product-category/new-arrivals' },
  { label: 'Kids Products', href: '/product-category/children-products' },
  { label: 'Contact', href: '/contact' },
];
