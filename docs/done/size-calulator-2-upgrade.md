Master Product Spec Kit may 2026

Cross-Domain Sizing CalculatorTarget Audience: Front-End & Database DevelopersCore Purpose: Convert user-provided footwear references into an absolute millimeter baseline, match it against brand-specific catalog constraints, and dynamically output product recommendations split by the user's geographical region.1. System Architecture & "Source of Truth" LogicThe engine must bypass the volatility of regional shoe sizes (US, EU, UK) by establishing a singular, absolute internal metric baseline.The Baseline Metric: The core truth of the entire application database must map to Millimeters (mm) / Centimeters (cm).The Calculation Pipeline:$$\text{User Reference Input} \longrightarrow \text{Convert to Absolute MM Baseline} \longrightarrow \text{Cross-Reference Target Brand Table} \longrightarrow \text{Output Recommended Size}$$Non-Binding Clause: The output is strictly a recommendation. Legal/support disclaimers must be programmatically injected at the final step to mitigate liability for incorrect fits.2. Front-End User Flow & UI ConstraintsStep 1: Baseline Reference SelectionThe user defines what type of footwear they currently own to base their measurement on.UI Components: 4 distinct selectable buttons/cards:Inline SkatesRoller SkatesIce SkatesSports Shoes (Default/fallback path for beginners or users without skate profiles)Step 2: Reference Brand DropdownDynamically populates a list of recognizable market brands based on the selection in Step 1 (e.g., if Sports Shoes is selected, display Nike, Adidas, Puma, Under Armour).SEO Optimization: Each brand option should be paired with metadata strings and optional outbound URLs pointing directly to the manufacturer's official sizing pages to capture long-tail organic search indexing.Step 3: Reference Size Input (Strict Mutually Exclusive Logic)Fields Displayed: CM | MM | EU | US Men | US WomenStrict State Constraint: The inputs must be mutually exclusive. As soon as a user enters a character into any single field, the remaining 4 fields must immediately trigger a disabled state (disabled={true}) and gray out. Clearing the active input field resets the state and re-enables all fields.Gender Data Standard: The developer must note that only US sizing splits data tables by gender. UK, EU, and Millimeter metrics are identical across gender tables in the database backend.Step 4: Output & Region-Aware E-Commerce LoopDisplay Absolute Measurement: Present text string: "Based on your selection, your estimated foot size is between X mm and Y mm."Intent Capture Purchase Path: Prompt the user with a final option: "What would you like to buy today?" $\rightarrow$ Buttons: Inline Skates | Roller Skates | Ski Boots.Final Recommendation: Display the exact calculated size matching their target item's brand chart.Inject Text-Based Width Disclaimer: Do not modify or shift the mathematical output based on foot width. Instead, append a static text string mapped to the target brand's profile:"This brand fits average in width. If your foot is wide, you may want to consider one size up."3. Multi-Tenant Domain Routing & E-Commerce IntegrationThe calculator engine is hosted on the .ca domain but will serve both Canadian and US/International traffic via cross-domain linking.Dynamic Search-Query ResolverBecause the product path structures vary significantly between the WooCommerce/WordPress .ca environment and the .com store, do not hardcode direct product URL slugs.Location-Context Sniffing: The tool must detect the client's browsing region mid-session.Dynamic Search String Execution: Instead of direct linking, map the final product recommendation cards to a programmatic query endpoint string:Canadian Users: Route to https://proskatersplace.ca/search?q=[Product+Name+String]US / International Users: Route to https://proskatersplace.com/search?q=[Product+Name+String]"Reveal Price" UI PatternTo prevent sluggish, real-time database lookups trying to sync conversion rates, active inventories, and regional pricing tiers across two separate platforms simultaneously, implement the following design pattern:Zero Price Render: Sample product display blocks rendered underneath the calculation results must completely omit currency text strings.Action Badge CTA: Render a highly visible badge stating: Click to find price.Tab State Persistence: All sample product recommendation links must force a new browser tab (target="\_blank"). The primary calculator tab must remain open and populated with the user's size metrics so their session is preserved.4. Product Catalog Scope FilterEnsure the database product query loops filter out historical or non-shippable items. Limit product loop outputs strictly to these high-leverage inventory groups:Inline SkatesRoller SkatesSki BootsNote: Exclude Skis, Ski Poles, and Ice Skates from the active retail suggestion layout module.Developer Database Data SchemaA. Reference Brands Data Table (Input Conversions)JSON{
"brand_id": "REF_NIKE_001",
"brand_name": "Nike",
"footwear_category": "Sports Shoes",
"official_sizing_url": "https://example.com/nike-size-chart",
"size_mappings": [
{
"standard_eu": 42.0,
"standard_us_men": 9.0,
"standard_us_women": 10.5,
"absolute_length_mm": 270
}
]
}
B. Carried Brands Data Table (Output Matching)JSON{
"brand_id": "CAR_FR_001",
"brand_name": "FR Skates",
"product_category": "Inline Skates",
"width_profile": "wide",
"static_disclaimer_text": "This brand features a wide shell profile. If you are between sizes, we recommend staying true to size.",
"catalog_mappings": [
{
"absolute_length_mm_range": {
"min": 266,
"max": 271
},
"recommended_brand_size": "42 / US 9"
}
]
}
Appendix: Sizing Data Entry Layout BlueprintTo orchestrate data migration, the client will populate a structured Google Sheet containing the following tab configurations to serve as the direct import source for the database tables.Tab 1: Reference Brands (Footwear Owned by Users)Columns Required:Brand Name (Text)Category (Dropdown: Sports Shoes, Inline Skates, Roller Skates, Ice Skates)Official Sizing URL (URL String)EU Size (Float)US Men Size (Float)US Women Size (Float)UK Size (Float)Absolute Value (MM) (Integer - Core Key)Tab 2: Retail Inventory Brands (Products Sold)Columns Required:Brand Name (Text)Target Category (Dropdown: Inline Skates, Roller Skates, Ski Boots)Width Profile (Dropdown: Narrow, Average, Wide)Custom Width Disclaimer Text (Long Text String)Min Foot Length (MM) (Integer)Max Foot Length (MM) (Integer)Recommended Shell Size Output (String - e.g., "EU 41 / US 8")Side Action Item: Category UX Layout OverhaulIndependent of the calculator development loop, update the master category archive page structure to optimize user browsing flow.The Problem: The current configuration presents a massive, flat, alphabetical list of paths ("wall of options"), making essential high-value inventory parts (such as Bearings or Skate Boots) visually invisible.The Fix: Group sub-categories inside clean, intuitive visual block components mimicking the layout of the primary .com mega-menu. Separate high-level hardware items into graphical grid items, and group granular utility items into clean text block matrices underneath.

as of dec 2025, the user flow for the size calculator upgrade will be as follows:

1.  Select the pair that you have:
    Inline Skates
    Roller Skates
    Ice Skates
    Brand Name Shoes

Select the Brand:
A drop-down with a list of brands for which we have the charts

3. Select the shoe size:
   EU
   US M
   CM / MP / MONDO
   UK - .com only or both
   MX? - .com only or both

4. Select the brand of the new skates
   A drop-down with a list of brands that we carry

5. Select your foot width:
   Narrow
   Average
   Wide

6. The recommended size:

Best control: **EU Best Comfort: **EU

LASTES USER PATH june 2026

Based on the design planning sessions, the calculator user path is built as a step-by-step funnel. It explicitly prioritizes what the user currently owns to establish a reliable baseline measurement, rather than asking what they want to buy upfront.

Here is the exact journey a user will experience from start to finish:

Step 1: The Baseline Selection (What They Own)
The user arrives at the calculator interface. To begin, they must identify a piece of footwear they already wear that fits them well.

User Action: The user clicks one of four big visual path cards:

Inline Skates

Roller Skates

Ice Skates

Sports Shoes (This acts as the catch-all option for beginners who don't already own skates).

Step 2: The Reference Brand Selection
Once the category is selected, the interface dynamically displays a clean list or dropdown of prominent brands specifically mapping to that category.

User Action: The user selects their specific brand (e.g., if they chose Sports Shoes, they select Nike or Adidas).

Behind the Scenes: The page surfaces subtle metadata and an optional link to that brand's official sizing chart to boost trust, transparency, and search engine optimization (SEO).

Step 3: Reference Size Input (The Locked State)
The user is presented with a clean interface featuring five input fields side-by-side: MM | CM | EU | US Men | US Women.

User Action: The user types their known size into one of these fields.

The Interface Constraint: As soon as they type a number into their chosen field (e.g., 9 into US Men), the other four fields instantly fade out and become unclickable. This prevents them from inputting mismatched data that would confuse the algorithm. If they delete the number, the other fields unlock again.

Step 4: Core Translation & Intent Capture
The moment the size is submitted, the backend script seamlessly translates that specific brand size into its absolute equivalent length in millimeters.

The Visual Transition: The screen reveals their internal calculation baseline: "Based on your selection, your estimated foot size is between 266 mm and 271 mm."

The Immediate Follow-up Question: The interface instantly prompts the next action: "What would you like to buy today?"

User Action: The user selects their shopping target: Inline Skates, Roller Skates, or Ski Boots.

Step 5: Target Brand Match & Final Output
The user selects the specific retail brand they are eyeing from your active shop catalog (e.g., FR Skates).

The Output Display: The screen populates their definitive size recommendation for that specific brand: "Your recommended size in FR Skates is: EU 42 / US 9".

The Nuance Disclaimer: Directly beneath this size recommendation, a tailored text block highlights the target brand’s unique shape attributes without altering the math:

"This brand features a wide shell profile. If you are between sizes, we recommend staying true to size."

Step 6: Contextual E-Commerce Feed (The Conversion Point)
To complete the loop, a localized micro-grid of sample products matching that precise recommended size automatically aggregates below their score.

User Action: The user browses a few relevant skate options. They notice there are no prices visible on the cards, just a clean badge that says Click to find price.

The Final Click: The user clicks an appealing skate model.

The Dynamic Redirection:

If they selected Canada at the start, a new browser tab opens to the Canadian product destination on proskatersplace.ca.

If they selected USA or International, that new tab opens to the product destination on proskatersplace.com.

Result: The user checks the price and checks out in their local currency, while the primary calculator tab remains completely intact on their screen so they don't lose their metrics.

## Implementation Addendum - Current Storefront Architecture

This addendum supersedes the older routing language above where it implies two independent WooCommerce backends or generic search-result redirects.

### One Backend, Two Storefront Destinations

ProSkaters Place currently has one WooCommerce/WordPress backend, and that backend is USD-oriented. The `.ca` experience is a headless Canadian storefront built for CAD presentation, speed, cacheability, and stronger Canadian SEO/permalink coverage. The calculator should therefore stay country-agnostic for sizing math and country-aware only at the final product-link step.

Required behavior:
- Do not show prices in the calculator.
- Use the backend or a generated catalog from the backend to identify matching product cards.
- Ask the shopper which storefront they want product links to open in before sizing starts: Canada, USA, or International.
- Do not use IP lookup, Cloudflare country headers, visitor tracking, or inferred geolocation for this decision.
- If the shopper chooses Canada, the "Click to find price" button should prefer the `.ca` product permalink from the headless route/search/KV map.
- If the shopper chooses USA or International, the button should use the `.com` product URL from the backend slug.
- If a precise `.ca` product link cannot be mapped, fall back to a `.ca` brand/category page first, then to the `.com` product URL only when that is the only real product destination.

The card remains simple: product image, product name, and a button labeled "Click to find price." The destination storefront owns price, currency, cart, and checkout.

The storefront selector is deliberately manual. It should not read or mutate cart cookies, WooCommerce session headers, checkout state, add-to-cart behavior, or global visitor-tracking state.

### Data Extraction And Sheet Fill Plan

The client is working through millimeter values in the Google Sheet, but engineering should prefill as much as possible from existing assets and backend data.

Extraction phases:
1. Inventory every sizing asset by brand, file type, chart quality, and target category.
2. Parse spreadsheet assets directly.
3. Use PDF text/table extraction first; use page images plus AI vision only where table extraction fails.
4. Use AI vision for JPG/PNG charts to identify headers, rows, units, size ranges, and width/fit notes.
5. Store extracted rows as reviewable JSON/CSV with source file, confidence, and notes.
6. Validate rows for required mm values, monotonic sizing, no overlapping carried-brand ranges, and valid category enums.
7. Query the backend for product names, slugs, SKUs, categories, manufacturer/brand terms, size attribute values, image URLs, and stock/visibility status.
8. Match backend products to `.ca` product routes using database ID, SKU, slug, then normalized name.
9. Prefill the Google Sheet from extracted data so client review focuses on corrections, missing mm values, and fit nuance.
10. Emit miss reports for unmapped chart rows, product URLs, and questionable AI-vision extraction rows.
