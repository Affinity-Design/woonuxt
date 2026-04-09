/* WooCommerce Analytics → Orders — add an "Origin" advanced filter */
(function () {
  "use strict";

  console.log("PG-Origin filter: Initializing...");

  // Wait for WooCommerce Admin to be ready
  function initOriginFilter() {
    // Check for required dependencies
    if (
      typeof wp === "undefined" ||
      !wp.hooks ||
      !wp.element ||
      !wp.components
    ) {
      console.log("PG-Origin: WordPress dependencies not ready, retrying...");
      setTimeout(initOriginFilter, 100);
      return;
    }

    // Check for origin data
    if (typeof pgOriginData === "undefined") {
      console.warn("PG-Origin: Origin data not available");
      return;
    }

    const { addFilter } = wp.hooks;
    const { createElement } = wp.element;
    const { SelectControl } = wp.components;

    console.log("PG-Origin: Dependencies ready, registering filter...");
    console.log("Origin data available:", pgOriginData);

    // Register the filter using the correct WooCommerce Analytics hook
    addFilter(
      "woocommerce_admin_analytics_orders_advanced_filters",
      "pg-origin/add-origin-filter",
      function (filters) {
        console.log(
          "PG-Origin: Filter hook triggered, current filters:",
          filters
        );

        const originFilter = {
          title: "Origin",
          filters: [
            {
              label: "Origin",
              value: "pg_origin",
              chartMode: "item-comparison",
              subFilters: [
                {
                  component: "SelectControl",
                  value: "pg_origin",
                  chartMode: "item-comparison",
                  label: "Origin is",
                  options: [
                    { label: "All origins", value: "" },
                    ...pgOriginData,
                  ],
                },
              ],
            },
          ],
        };

        console.log("PG-Origin: Adding origin filter:", originFilter);
        return {
          ...filters,
          pg_origin: originFilter,
        };
      }
    );

    // Also try the alternative filter hook structure
    addFilter(
      "woocommerce_admin_analytics_orders_filters",
      "pg-origin/add-origin-select",
      function (filters) {
        console.log("PG-Origin: Alternative filter hook triggered");

        if (Array.isArray(filters)) {
          filters.push({
            label: "Origin",
            staticParams: ["pg_origin"],
            param: "pg_origin",
            showFilters: () => true,
            filters: [
              {
                label: "Origin",
                value: "pg_origin",
                component: "SelectControl",
                options: [{ label: "All origins", value: "" }, ...pgOriginData],
              },
            ],
          });
        }

        return filters;
      }
    );

    // Register a query parameter handler
    addFilter(
      "woocommerce_admin_analytics_orders_query_args",
      "pg-origin/add-query-params",
      function (query, urlQuery) {
        console.log("PG-Origin: Query filter triggered", { query, urlQuery });

        if (urlQuery.pg_origin && urlQuery.pg_origin !== "") {
          query.meta_query = query.meta_query || [];
          query.meta_query.push({
            key: "pg_origin",
            value: urlQuery.pg_origin,
            compare: "=",
          });
          console.log(
            "PG-Origin: Added meta query for origin:",
            urlQuery.pg_origin
          );
        }

        return query;
      }
    );

    console.log("PG-Origin: Filter registration complete");
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOriginFilter);
  } else {
    initOriginFilter();
  }
})();
