# Mega Menu & Mobile Navigation Plan
## ProSkaters Place Canada — Navigation Overhaul

**Date:** 2026-05-26  
**Stack:** Nuxt 3, Vue 3, Tailwind CSS  
**Scope:** Desktop mega menu, mobile multi-level drawer, category page top-nav index

---

## 1. Current State Audit

### What exists today
| Location | Component | State |
|---|---|---|
| Desktop nav | `MainMenu.vue` | 6 flat links, no dropdowns |
| Mobile nav | Base `MenuTrigger` (unknown base component) | Unknown — likely slide-in |
| Header | `AppHeader.vue` | Solid white sticky, no adaptive transparency |
| Category page | `pages/categories.vue` | Grid of cards — no top-level quick-nav index |

### Problems to solve
1. Flat nav forces users to click "Categories" and then browse a grid to find subcategories — two steps to reach a product type
2. No visual preview of what's inside each top-level category
3. Mobile trigger is inaccessible — top-screen hamburger (2018 pattern)
4. Category page lacks a scannable top-level index after the featured images — users miss subcategories
5. No Clearance / SALE prominence in navigation

---

## 2. Navigation Taxonomy

This is the source of truth for both desktop and mobile. All components derive from this structure.

```
Inline Skating  (/product-category/inline-skates)
  ├── Complete Skates
  │   ├── Recreational / Fitness Skates
  │   ├── Aggressive Inline Skates
  │   ├── Speed Skates
  │   ├── Urban / Freeskates
  │   └── Kids Inline Skates
  ├── Specialty Skates
  │   ├── Off Road | SUV Skates
  │   ├── RollerSki | Nordic Skates
  │   └── Ice Skates
  ├── Parts & Upgrades
  │   ├── Inline Skate Frames
  │   ├── Inline Frame Sets
  │   ├── Inline Skate Wheels
  │   ├── Inline Skate Bearings
  │   ├── Inline Skate Brakes
  │   └── Inline Skate Liners
  └── Accessories
      ├── Color Kits & Laces
      └── Skate Tools

Roller Skating  (/product-category/roller-skates)
  ├── Complete Skates
  │   ├── Artistic / Rhythm Skates
  │   ├── Derby / Jam Skates
  │   ├── Recreational Roller Skates
  │   ├── High-Top Skates
  │   └── Kids Roller Skates
  ├── Parts & Upgrades
  │   ├── Roller Skate Plates
  │   ├── Roller Skate Wheels
  │   ├── Toe Stops & Plugs
  │   └── Roller Bearings
  └── Accessories

Alpine | Nordic Skiing  (/product-category/winter-sports)
  ├── Alpine
  │   ├── Alpine Skis
  │   ├── Alpine Poles
  │   └── Alpine Packages
  └── Nordic / Cross-Country
      ├── Cross-Country Skis
      └── Nordic Poles

Scooters  (/product-category/scooters)
  ├── Push Scooters
  ├── Stunt Scooters
  ├── Electric Scooters
  └── Scooter Parts & Accessories

Skateboards  (/product-category/skateboards-and-longboards)
  ├── Complete Skateboards
  ├── Longboards
  ├── Skateboard Parts
  └── Longboard Parts & Accessories

Protection & Apparel  (/product-category/protection-gear-and-apparel)
  ├── Head Protection (Helmets)
  ├── Knee & Elbow Pads
  ├── Wrist Guards
  ├── Full Protection Sets
  ├── Apparel
  └── Backpacks & Bags

SALE  (/product-category/clearance-items)
```

> **Implementation note:** Slugs need to be verified against actual WPGraphQL category slugs before coding. The taxonomy above uses current known slugs as a base — subcategory slugs may need to be audited against the live WooCommerce instance.

---

## 3. Desktop Mega Menu

### 3.1 Visual concept

A **full-width panel mega menu** that drops below the sticky header bar. Each top-level item opens a panel divided into columns: featured visual (category hero image + CTA), grouped subcategory links, and a curated "editorial" callout (e.g., "New Arrivals in Inline" or a size guide link).

Think: REI meets Decathlon — informational, scannable, fast to navigate, with a strong visual anchor. Better than the .com site because it adds:
- A featured image column with a direct CTA per category
- Grouped subcategory columns (not a flat alphabetical dump)
- An editorial/editorial callout (size calculator shortcut, new arrivals badge, sale signal)
- Adaptive transparency header (transparent → frosted glass on scroll)

### 3.2 Header component spec

**File:** `components/generalElements/AppHeader.vue` (override)

```
State machine:
  'transparent'  → page top, scrollY = 0
  'frosted'      → scrollY > 10px

Transitions (CSS, not Framer Motion — Nuxt/Vue):
  background-color: transparent → rgba(255,255,255,0.88)
  backdrop-filter: none → blur(20px) saturate(180%)
  box-shadow: none → 0 1px 0 rgba(0,0,0,0.06)
  Transition duration: 200ms ease
```

**Layout (desktop lg+):**
```
[Logo 160px] [MainMenu flex-1 center] [Search | Account | Cart]
height: 64px
sticky top-0 z-50
```

**Layout (mobile < lg):**
```
[Logo center] [Cart icon right]
height: 56px
Bottom bar handles all navigation (see Section 4)
```

### 3.3 MegaMenu component architecture

```
components/
  generalElements/
    AppHeader.vue           ← override (adaptive transparency, layout)
    MainMenu.vue            ← override (top-level nav items + mega panel trigger)
    MegaMenuPanel.vue       ← NEW: the full-width dropdown panel
    MegaMenuColumn.vue      ← NEW: reusable column inside the panel
    MegaMenuFeatured.vue    ← NEW: left-column hero image + CTA
    MegaMenuEditorial.vue   ← NEW: right-column editorial callout
```

### 3.4 Interaction spec

**Trigger:** hover (desktop) with a 150ms open delay (prevents accidental open on fast cursor pass-through). Close on mouse leave the header+panel combined zone with 200ms grace delay.

**Keyboard:** `Tab` into a top-level link opens the panel. `Arrow Down` moves focus into the panel. `Escape` closes and returns focus to the trigger. Full ARIA `role="menubar"` / `role="menu"` / `role="menuitem"` implementation.

**Active state:** Top-level link gets an animated underline bar (not just bg-gray-100) — 2px accent-color bottom border that slides in with `scaleX(0 → 1)` from left.

**Panel animation (CSS transitions — Vue `<Transition>`):**
```
enter:  opacity 0→1 (150ms), translateY -8px→0 (150ms ease-out)
leave:  opacity 1→0 (100ms), translateY 0→-4px (100ms)
```

No Framer Motion — this is a Nuxt/Vue project, not React. Use Vue transitions.

### 3.5 Panel layout structure (per category)

```
┌──────────────────────────────────────────────────────────────────┐
│ MEGA PANEL (full header width, max-height 520px, scroll inside)  │
│                                                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │
│ │ FEATURED     │ │ COLUMN A     │ │ COLUMN B     │ │ EDITORI │ │
│ │ [Image 240px]│ │ Group Title  │ │ Group Title  │ │ AL      │ │
│ │              │ │ — Sub link   │ │ — Sub link   │ │ callout │ │
│ │ Category     │ │ — Sub link   │ │ — Sub link   │ │ card    │ │
│ │ headline     │ │ — Sub link   │ │ — Sub link   │ │         │ │
│ │              │ │ ──────────── │ │ ──────────── │ │ [CTA]   │ │
│ │ [Shop All →] │ │ Group Title  │ │ Group Title  │ │         │ │
│ │              │ │ — Sub link   │ │ — Sub link   │ │         │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘ │
└──────────────────────────────────────────────────────────────────┘
  240px fixed     flex-1 auto        flex-1 auto      220px fixed
```

### 3.6 Data structure

Define the mega menu in a static data file that drives both desktop and mobile:

**File:** `data/navigation.ts`

```typescript
export interface NavSubItem {
  label: string
  slug: string           // WooCommerce category slug
  badge?: 'new' | 'sale' // optional pill badge
}

export interface NavGroup {
  groupTitle: string
  items: NavSubItem[]
}

export interface NavTopLevel {
  label: string
  slug: string           // top-level category slug (also the "Shop All" link)
  image: string          // /images/nav/ category hero image
  imageAlt: string
  headline: string       // headline inside featured column
  editorial?: {          // optional right-column callout
    label: string
    description: string
    linkLabel: string
    href: string
  }
  groups: NavGroup[]     // subcategory column groups
}

export const navigation: NavTopLevel[] = [
  {
    label: 'Inline Skating',
    slug: 'inline-skates',
    image: '/images/nav/inline-skating.jpg',
    imageAlt: 'Inline skates for all skating styles',
    headline: 'Built for speed,\ncontrol & style.',
    editorial: {
      label: 'Not sure on size?',
      description: 'Use our free size calculator to find your perfect fit.',
      linkLabel: 'Try the Size Calculator',
      href: '/roller-skates-size-calculator',
    },
    groups: [
      {
        groupTitle: 'Complete Skates',
        items: [
          { label: 'Recreational / Fitness', slug: 'recreational-inline-skates' },
          { label: 'Aggressive Inline', slug: 'aggressive-inline-skates' },
          { label: 'Speed Skates', slug: 'speed-skates' },
          { label: 'Urban / Freeskates', slug: 'urban-freeskates' },
          { label: 'Kids Inline Skates', slug: 'kids-inline-skates', badge: 'new' },
        ],
      },
      {
        groupTitle: 'Specialty',
        items: [
          { label: 'Off Road | SUV', slug: 'off-road-inline-skates' },
          { label: 'RollerSki | Nordic', slug: 'rollerskis' },
          { label: 'Ice Skates', slug: 'ice-skates' },
        ],
      },
      {
        groupTitle: 'Parts & Upgrades',
        items: [
          { label: 'Inline Frames', slug: 'inline-skate-frames' },
          { label: 'Inline Frame Sets', slug: 'inline-frame-sets' },
          { label: 'Wheels', slug: 'inline-skate-wheels' },
          { label: 'Bearings', slug: 'inline-skate-bearings' },
          { label: 'Brakes', slug: 'inline-skate-brakes' },
          { label: 'Liners', slug: 'inline-skate-liners' },
        ],
      },
      {
        groupTitle: 'Accessories',
        items: [
          { label: 'Color Kits & Laces', slug: 'color-kits-laces' },
          { label: 'Skate Tools', slug: 'skate-tools' },
        ],
      },
    ],
  },
  // ... Roller Skating, Alpine|Nordic, Scooters, Skateboards, Protection
]
```

### 3.7 SALE treatment

**SALE** is a standalone link (no panel), styled differently:
- Color: `text-red-600 font-semibold` when not active
- Hover: underline + slight background `bg-red-50`
- Active: `bg-red-600 text-white` pill badge
- Position: always last in the nav bar, with a left separator `|`

---

## 4. Mobile Navigation

### 4.1 Pattern selection

Decision tree outcome: **Pattern 2 — Visual Mega-Menu** inside a **`side="left"` slide-in drawer** (`v-if` controlled, full Vue Transition), combined with **Pattern 1 — Bottom Bar** for the persistent primary actions.

**Reasoning:**
- ProSkaters Place sells products with strong visual category identity
- Users need multi-level drill-down (top → subcategory group → subcategory)
- The .com site screenshot shows category images — visual navigation is already part of the brand expectation
- Bottom bar handles the 5 universally-needed actions (Home, Shop, Search, Account, Cart)

### 4.2 Bottom Bar (always visible, mobile only)

**File:** `components/generalElements/MobileBottomBar.vue` (NEW)

```
Fixed bottom-0, full-width, 64px height + safe-area-inset-bottom padding
Background: rgba(255,255,255,0.88) backdrop-blur-xl
Border-top: 1px solid rgba(0,0,0,0.08)

5 items (icon + label, each min 44×44px tap target):
  [Home]  [Shop]  [Search]  [Account]  [Cart (badge)]

"Shop" tap → opens the mobile drawer (see 4.3)
```

```vue
<!-- Approximate structure -->
<nav class="mobile-bottombar-nav-fixed-v1 fixed bottom-0 left-0 right-0 z-50 
            flex items-center justify-around
            bg-white/88 backdrop-blur-xl border-t border-black/8
            pb-safe lg:hidden"
     style="padding-bottom: env(safe-area-inset-bottom)">
  <MobileNavItem icon="HomeIcon" label="Home" to="/" />
  <MobileNavItem icon="GridIcon" label="Shop" @click="openDrawer" />
  <MobileNavItem icon="MagnifyingGlassIcon" label="Search" @click="openSearch" />
  <MobileNavItem icon="PersonIcon" label="Account" to="/my-account" />
  <MobileNavItem icon="CartIcon" label="Cart" @click="openCart" :badge="cartCount" />
</nav>
```

> Icons: Use inline SVG from Heroicons or a local SVG sprite — Radix Icons are React-only; for Vue use `@heroicons/vue` or inline paths. Same visual weight, same 20px render size.

### 4.3 Mobile Drawer — Multi-level Navigation

**File:** `components/generalElements/MobileNavDrawer.vue` (NEW)

**Behavior — three levels:**

```
Level 0 (Root):          Level 1 (Category):       Level 2 (Group):
─────────────────         ─────────────────────      ─────────────────────────
[← Close]                 [← Inline Skating]         [← Complete Skates]
                          [Category image banner]
Inline Skating    →       ──────────────────         Recreational / Fitness
Roller Skating    →       Shop All Inline →          Aggressive Inline
Alpine | Nordic   →                                  Speed Skates
Scooters          →       Complete Skates   →        Urban / Freeskates
Skateboards       →       Specialty         →        Kids Inline Skates
Protection & App  →       Parts & Upgrades  →
──────────────────        Accessories       →
SALE (red)
Blog
Size Calculator
Contact
```

**Transition between levels:**
- Level → Level+1: slide left (`translateX(0 → -100%`) for outgoing, `translateX(100% → 0)` for incoming
- Level → Level-1: reverse (slide right)
- Duration: 280ms, `ease-out`
- Back button is always in the top-left, 44×44px minimum
- The category image banner on Level 1 gives visual context (same image as desktop mega menu)

**Drawer container:**
```
width: min(85vw, 380px)
height: 100dvh
background: #ffffff
position: fixed left-0 top-0 z-[60]
overflow: hidden (level panels slide within this container)
```

**Scrim:** `fixed inset-0 bg-black/50 z-[59]` — tapping closes drawer.

**Root level extras (below main categories):**
```
──────────────────
SALE             → (red text, /product-category/clearance-items)
──────────────────
Blog
Size Calculator
Contact
──────────────────
[Free shipping $99+]   ← trust signal strip at bottom
```

### 4.4 Level 1 visual treatment

Each category panel (Level 1) opens with a **compact image banner** at the top:

```
┌─────────────────────────────────┐
│ [← Back]        [Close X]       │ ← 56px header
├─────────────────────────────────┤
│ [Category image 100% × 140px]  │ ← object-cover, brand photo
│  INLINE SKATING   [Shop All →] │ ← overlay text
├─────────────────────────────────┤
│ Complete Skates            →    │
│ Specialty                  →    │
│ Parts & Upgrades           →    │
│ Accessories                →    │
└─────────────────────────────────┘
```

Group rows are `56px` tall minimum (safe tap target), `border-b border-gray-100`.

### 4.5 Level 2 (subcategory list)

Simple list — no image, just links. Each item:
- `48px` height minimum
- `border-b border-gray-50`
- `ChevronRightIcon` on items that are leaf nodes (links to product-category pages)
- Active route gets left accent bar `4px bg-accent-500`

---

## 5. Category Page Redesign

### 5.1 Problem

Current categories page: hero grid of cards → no quick-scan index below → users must scroll and read every card to find their subcategory.

### 5.2 Solution: Top-level index strip after featured cards

Add a **sticky alphabet-free category index** directly below the featured card grid. This is a horizontally scrollable pill strip that shows all top-level categories, followed by a **grouped subcategory quick-links section** with anchor links.

**Page structure (revised):**

```
[Page H1 — "Shop All Categories"]
[Featured Category Card Grid — 2/3/4 col, existing cards]
─────────────────────────────────────────────────────────────
[TOP-LEVEL QUICK INDEX — horizontal pill strip, sticky below header]
  [Inline Skating] [Roller Skating] [Alpine | Nordic] [Scooters] [Skateboards] [Protection] [SALE]
─────────────────────────────────────────────────────────────
[Inline Skating section]          ← anchor #inline-skating
  Brief 1-line description
  Subcategory grid (3–4 col):
    [Recreational]  [Aggressive]  [Speed]  [Off Road]
    [Wheels]  [Frames]  [Bearings]  [Liners]  [Tools]
    
[Roller Skating section]          ← anchor #roller-skating
  ...subcategory grid...

[Alpine | Nordic Skiing section]  ← anchor #alpine-nordic
  ...

[Scooters section]                ← anchor #scooters
[Skateboards section]             ← anchor #skateboards
[Protection & Apparel section]    ← anchor #protection

─────────────────────────────────────────────────────────────
[SEO content block — existing, moved to bottom]
[Why Shop section — existing, moved to bottom]
```

### 5.3 Subcategory card (mini format)

Smaller than the featured cards — text-forward with a small icon or category thumbnail:

```
┌──────────────────┐
│ [img 48×48px]    │
│ Recreational     │
│ Inline Skates    │
│ →                │
└──────────────────┘
```

Or text-only pill links in a `flex-wrap` row — faster to scan, less scroll needed.

### 5.4 Sticky index pill strip

The pill strip sticks below the `AppHeader` (`top: 64px`) on desktop, `top: 0` on mobile (because bottom bar handles mobile nav). It scrolls horizontally on mobile without a scrollbar.

Active pill: solid background (PSP accent color), white text. Inactive: `bg-gray-100 text-gray-700 hover:bg-gray-200`.

Clicking a pill smooth-scrolls to that section anchor.

---

## 6. Brand & Design Tokens

Based on the existing site (black/dark header in screenshot, gold/amber accent color in nav links):

```css
/* PSP brand tokens — verify against actual tailwind.config.ts */
--color-accent:    #C8962A;   /* amber-gold — "INLINE SKATING" link color in screenshot */
--color-accent-hover: #B07D1C;
--color-nav-bg:   #1a1a1a;   /* dark background from categories page */
--color-sale:     #DC2626;   /* red-600 for SALE/clearance */

/* Header */
--header-height-desktop: 64px;
--header-height-mobile:  56px;
--bottombar-height:      64px;
```

> Check `woonuxt_base/tailwind.config.ts` and any CSS custom properties before finalizing tokens.

---

## 7. Accessibility Checklist

- [ ] `role="menubar"` on desktop top-level nav, `role="menu"` on panels, `role="menuitem"` on links
- [ ] `aria-haspopup="true"` and `aria-expanded` on top-level items with panels
- [ ] `aria-label="Site navigation"` on `<nav>`
- [ ] Panel close on `Escape` — focus returns to triggering top-level item
- [ ] `Arrow Down` / `Arrow Up` move focus between panel items
- [ ] Mobile drawer: focus trap while open, close on `Escape`
- [ ] All tap targets ≥ 44×44px (mobile)
- [ ] Bottom bar icons each have `aria-label` (icon-only has accessible text)
- [ ] Scrim has `aria-hidden="true"` — it is decorative
- [ ] `prefers-reduced-motion`: disable slide/fade transitions, use instant show/hide

---

## 8. Component File Plan

| File | Status | Notes |
|---|---|---|
| `components/generalElements/AppHeader.vue` | Override | Add adaptive transparency, bottom-bar padding on mobile |
| `components/generalElements/MainMenu.vue` | Override | Replace flat links with mega menu trigger items |
| `components/generalElements/MegaMenuPanel.vue` | NEW | Full-width dropdown panel, driven by `navigation.ts` |
| `components/generalElements/MegaMenuColumn.vue` | NEW | Reusable group column for panel |
| `components/generalElements/MegaMenuFeatured.vue` | NEW | Left image + CTA column |
| `components/generalElements/MegaMenuEditorial.vue` | NEW | Right editorial callout column |
| `components/generalElements/MobileBottomBar.vue` | NEW | Sticky bottom nav, mobile only |
| `components/generalElements/MobileNavDrawer.vue` | NEW | Multi-level slide-in drawer |
| `components/generalElements/MobileNavLevel.vue` | NEW | Reusable level panel inside drawer |
| `data/navigation.ts` | NEW | Single source of truth for all nav |
| `pages/categories.vue` | Override | Add top-index strip + grouped subcategory sections |

---

## 9. Implementation Phases

### Phase 1 — Data & Architecture (no visible UI change) — ✅ COMPLETE 2026-05-28
1. ✅ Audited WPGraphQL via `scripts/audit-category-slugs.js` → `data/category-slugs-audit.json` + `data/category-slugs-audit.txt` (69 categories, 12 empty, all reconciled)
2. ✅ `data/navigation.ts` created — every slug verified against the live audit
3. ✅ Reused existing `/public/images/*.jpeg` for nav hero imagery — no new image work required

### Phase 2 — Desktop Mega Menu — ✅ COMPLETE 2026-05-28
1. ✅ `composables/useMegaMenu.ts` — shared state machine, 150ms open / 200ms close grace delays, `openImmediate` for keyboard focus, `closeNow` for route changes + Escape
2. ✅ `components/generalElements/AppHeader.vue` — adaptive blur (frosted at scrollY > 10), mounts `<MegaMenuPanel>` inside header so mouseleave on header schedules close
3. ✅ `components/generalElements/MainMenu.vue` — desktop top-level triggers with hover scheduling, focus-open, keyboard `ArrowDown/Enter/Space`, animated underline on active/open state; mobile fallback flat list (preserves base `MobileMenu` drawer behaviour until Phase 3)
4. ✅ `components/generalElements/MegaMenuPanel.vue` — Vue `<Transition>` (150ms enter / 100ms leave with translateY), Escape-to-close, route-change auto-close, `prefers-reduced-motion` respected
5. ✅ `components/generalElements/MegaMenuFeatured.vue` — 240px featured image + multi-line headline + "Shop All" CTA
6. ✅ `components/generalElements/MegaMenuColumn.vue` — group title + subcategory list with badge support
7. ✅ `components/generalElements/MegaMenuEditorial.vue` — amber-tinted right-rail callout
8. ✅ SALE link — standalone red treatment with left separator, immediate panel-close on hover
9. ✅ Verified on dev server: homepage + `/product-category/inline-skating` both return 200, 6 `aria-haspopup="true"` triggers in DOM, active-route underline applies correctly

### Phase 3 — Mobile Navigation — ✅ COMPLETE 2026-05-28
1. ✅ `composables/useMobileNav.ts` — level (0|1|2) + direction (`forward`|`back`) state machine. Piggybacks on existing `isShowingMobileMenu` flag for backwards compatibility with the base layer's body-overflow watcher.
2. ✅ `components/generalElements/MobileBottomBar.vue` — fixed bottom-0, 5 items (Home, Shop, Search, Account, Cart with badge), safe-area-inset-bottom padding, 44×44 tap targets, frosted blur background, z-45 (sits above page, below cart/drawer). Auto-hides when cart or drawer is open via `v-show`.
3. ✅ `components/generalElements/MobileNavDrawer.vue` — Teleport-mounted slide-in (left, `min(85vw,380px)`), Vue `<Transition>` between levels with forward/back direction-aware CSS, Escape closes, `prefers-reduced-motion` honoured. Level 1 shows the same hero image as the desktop mega panel.
4. ✅ Replaced base `<MobileMenu />` in `app.vue` with `<MobileNavDrawer />`. Cart scrim retained, mobile drawer brings its own scrim via Teleport.
5. ✅ Removed `<MenuTrigger>` from `AppHeader.vue` — bottom bar's "Shop" button is now the only mobile nav entry point. Base `MenuTrigger.vue` left untouched in `woonuxt_base/`.
6. ✅ Added `pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0` to the outer flex column in `app.vue` so page content scrolls clear of the fixed bar.
7. ✅ Verified on dev server: home + `/product-category/inline-skating` both 200, no Vue warnings, hamburger icon (`ion:menu-outline`) no longer in DOM.

### Phase 4 — Category Page — ✅ COMPLETE 2026-06-05
1. ✅ `components/shopElements/CategoryDirectory.vue` — searchable, nested directory driven by `navigation.ts`, mounted in `pages/categories.vue` between the featured grid and the "Why Shop" block (carries `id="all-categories"`).
2. ✅ Sticky top-level "jump bar" (6 categories + SALE) with smooth-scroll + `IntersectionObserver` scroll-spy for the active pill; hidden while searching.
3. ✅ All sections render expanded with grouped subcategory links (icons + badges, mirrors `MegaMenuColumn`), plus live product counts merged by slug from the page's existing `getProductCategories` nodes.
4. ✅ **Added beyond original plan:** a search box that filters the whole catalog live — curated taxonomy plus long-tail categories (not in the mega menu) surfaced under an "Other matches" group, with a no-results state.
5. ✅ Removed the old generic pill chips + flat "More Categories" dump and the leftover `[DEBUG V3]` console statements from `pages/categories.vue`.

### Phase 5 — Polish & QA
1. Test all category/subcategory slugs resolve to real pages (404 audit)
2. Verify `prefers-reduced-motion` disables all transitions
3. Run Lighthouse accessibility audit (target: zero ARIA errors)
4. Test on iOS Safari with notch (safe-area-inset-bottom)
5. Test keyboard navigation end-to-end

---

## 10. Key Decisions & Trade-offs

| Decision | Chosen | Alternative | Reason |
|---|---|---|---|
| Mobile nav pattern | Bottom bar + slide-in drawer | Top hamburger only | Thumb-zone ergonomics, visual category discovery |
| Mega menu trigger | Hover (150ms delay) | Click | Standard desktop ecommerce pattern, faster for browsing |
| Nav data source | Static `data/navigation.ts` | GraphQL-driven | Categories are curated/stable; avoid waterfall fetch on every page load |
| Panel animation | Vue `<Transition>` CSS | JS-driven | Simpler in Nuxt/Vue, no extra dependency, hardware-accelerated |
| Category page pills | Horizontal scroll strip | Sidebar | Better mobile experience, above-fold on narrow viewports |
| SALE item | Standalone link (no panel) | Panel with subcategories | Sale is a destination, not a browse hierarchy |

---

## 11. Open Questions — RESOLVED 2026-05-28

1. **Live category slugs** — ✅ Audited via `scripts/audit-category-slugs.js`. Results in `data/category-slugs-audit.txt`. **Key corrections from the original plan**:
   - Inline top-level is `inline-skating` (203 products), NOT `inline-skates` (167 — that's the "Complete Skates" child).
   - Roller top-level is `roller-skating` (69), NOT `roller-skates` (65 — that's the quad-skates child).
   - The following plan slugs **do not exist** as WP categories (they're product attributes, not taxonomy): `recreational-inline-skates`, `aggressive-inline-skates`, `speed-skates`, `urban-freeskates`, `kids-inline-skates`, `artistic-rhythm-skates`, `derby-jam-skates`, `high-top-skates`, `inline-skate-frames` (actual: `inline-frames`), `inline-frame-sets` (actual: `complete-frame-sets`), `off-road-inline-skates` (actual: `off-road-skates`), `inline-skate-brakes` (actual: `skate-heel-brakes`), `alpine-packages`, `push-scooters`, `electric-scooters` (empty in WP), `head-protection`, `wrist-guards` (actual: `gloves-wrist-protection`), `full-protection-sets` (actual: `protection-packs`), `apparel`, `backpacks-and-bags` (actual: `backpacks-bags-carriers`).
   - The verified, reshaped taxonomy now lives in `data/navigation.ts` and is the single source of truth.
2. **Nav hero images** — ✅ Existing `/public/images/*.jpeg` covers every top-level category (`Inline-Skating.jpeg`, `Roller-Skating.jpeg`, `Winter-Sports.jpeg`, `Scooters.jpeg`, `skateboards-and-longboards.jpeg`, `Protection-Gear.jpeg`, `Clearance.jpeg`). No photo brief needed; no `/images/nav/` subdirectory required.
3. **Panel theme** — ✅ Light (white) panel chosen for premium feel and distinction from the .com dark theme.
4. **Base `MenuTrigger`** — ✅ Inspected. It is just an icon that calls `useHelpers().toggleMobileMenu()`. We can safely replace its usage with the new bottom-bar trigger in `AppHeader.vue`; the base file stays untouched in `woonuxt_base/`.
5. **Bottom bar item order** — ✅ Confirmed: `[Home, Shop, Search, Account, Cart]`. Cart on the right where the right-handed thumb naturally rests.
