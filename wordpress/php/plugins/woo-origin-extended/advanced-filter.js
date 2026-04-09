/* WooCommerce Analytics Orders Origin Filter */
(function () {
  "use strict";

  function initAdvancedOriginFilter() {
    // Check for required dependencies
    if (typeof wp === "undefined" || !wp.hooks || !wp.element || !wp.i18n) {
      setTimeout(initAdvancedOriginFilter, 200);
      return;
    }

    // Check for origin data
    if (typeof pgOriginData === "undefined") {
      return;
    }

    const { addFilter } = wp.hooks;
    const { __ } = wp.i18n;

    // Register the origin filter using the correct WooCommerce hook
    addFilter(
      "woocommerce_admin_orders_report_filters",
      "pg-origin/add-origin-filter",
      function (filters) {
        // Create origin filter configuration
        const originFilter = {
          label: __("Origin", "woocommerce"),
          staticParams: [],
          param: "pg_origin",
          showFilters: () => true,
          defaultValue: "",
          filters: pgOriginData.map((origin) => ({
            value: origin.value,
            label: origin.label,
          })),
        };

        // Add our filter to the existing filters array
        return [originFilter, ...filters];
      }
    );
  }

  // Initialize when ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdvancedOriginFilter);
  } else {
    initAdvancedOriginFilter();
  }
})();
