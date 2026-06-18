/**
 * Root app configuration (overrides woonuxt_base/app/app.config.ts).
 *
 * Only the keys defined here override the base layer; everything else
 * (storeSettings, etc.) is inherited from the base app.config.
 *
 * siteName drives the global title template (`%s - ${siteName}`) in app.vue,
 * so the document <title> on every page ends with this brand instead of
 * the base default of "WooNuxt".
 */
export default defineAppConfig({
  siteName: 'ProSkaters Place',
});
