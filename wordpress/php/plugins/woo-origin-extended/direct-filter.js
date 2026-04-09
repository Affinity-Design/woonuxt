/* WooCommerce Analytics Orders Origin Filter - Direct Integration */
(function () {
  "use strict";

  console.log("PG-Origin Direct: Starting direct integration...");

  function initDirectIntegration() {
    // Check basic dependencies
    if (typeof wp === "undefined" || !wp.hooks) {
      console.log(
        "PG-Origin Direct: Basic dependencies not ready, retrying..."
      );
      setTimeout(initDirectIntegration, 100);
      return;
    }

    // Check for origin data
    if (typeof pgOriginData === "undefined") {
      console.warn("PG-Origin Direct: Origin data not available");
      return;
    }

    const { addFilter, addAction } = wp.hooks;

    console.log("PG-Origin Direct: Basic dependencies ready");
    console.log("PG-Origin Direct: Origin data:", pgOriginData);

    // Try to hook into various WooCommerce Analytics extension points
    const hooks = [
      "woocommerce_admin_analytics_orders_advanced_filters",
      "woocommerce_analytics_orders_advanced_filters",
      "wc_admin_analytics_orders_advanced_filters",
      "woocommerce_admin_analytics_orders_filters",
      "woocommerce_analytics_orders_filters",
      "wc_admin_analytics_orders_filters",
    ];

    hooks.forEach(function (hookName) {
      addFilter(hookName, "pg-origin-direct/" + hookName, function (filters) {
        console.log("PG-Origin Direct: Hook triggered -", hookName, filters);

        try {
          // Handle different filter structure formats
          if (typeof filters === "object" && filters !== null) {
            if (Array.isArray(filters)) {
              // Array format
              const originFilter = {
                label: "Origin",
                staticParams: ["pg_origin"],
                param: "pg_origin",
                showFilters: function () {
                  return true;
                },
                filters: [
                  {
                    label: "Origin",
                    value: "pg_origin",
                    component: "SelectControl",
                    options: [
                      { label: "All origins", value: "" },
                      ...pgOriginData,
                    ],
                  },
                ],
              };

              filters.push(originFilter);
              console.log("PG-Origin Direct: Added to array format");
            } else {
              // Object format
              filters.pg_origin = {
                title: "Origin",
                filters: {
                  pg_origin: {
                    allowMultiple: false,
                    labels: {
                      add: "Order Origin",
                      placeholder: "Select origin",
                      rule: "Origin is",
                      title: "Origin: {{filter}}",
                      filter: "{{filter}}",
                    },
                    rules: [
                      {
                        value: "is",
                        label: "Is",
                      },
                    ],
                    input: {
                      component: "SelectControl",
                      options: [
                        { label: "All origins", value: "" },
                        ...pgOriginData,
                      ],
                    },
                  },
                },
              };
              console.log("PG-Origin Direct: Added to object format");
            }
          }
        } catch (error) {
          console.error(
            "PG-Origin Direct: Error processing filter for",
            hookName,
            error
          );
        }

        return filters;
      });
    });

    // Hook into query modification
    addFilter(
      "woocommerce_admin_analytics_orders_query_args",
      "pg-origin-direct/query",
      function (query, params) {
        console.log("PG-Origin Direct: Query filter triggered", {
          query,
          params,
        });

        if (params && params.pg_origin && params.pg_origin !== "") {
          if (!query.meta_query) {
            query.meta_query = [];
          }

          query.meta_query.push({
            key: "pg_origin",
            value: params.pg_origin,
            compare: "=",
          });

          console.log(
            "PG-Origin Direct: Modified query for origin:",
            params.pg_origin
          );
        }

        return query;
      }
    );

    // Also try to hook into the URL parameter handling
    addFilter(
      "woocommerce_admin_analytics_orders_query",
      "pg-origin-direct/url-query",
      function (query, urlQuery) {
        console.log("PG-Origin Direct: URL query filter", { query, urlQuery });

        if (urlQuery && urlQuery.pg_origin && urlQuery.pg_origin !== "") {
          // Ensure the parameter gets passed through
          query.pg_origin = urlQuery.pg_origin;
          console.log("PG-Origin Direct: Preserved pg_origin in query");
        }

        return query;
      }
    );

    // Set up monitoring to see what's happening
    addAction(
      "woocommerce_admin_analytics_orders_init",
      "pg-origin-direct/monitor",
      function () {
        console.log("PG-Origin Direct: Analytics orders initialized");
      }
    );

    console.log("PG-Origin Direct: All filters registered");
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDirectIntegration);
  } else {
    initDirectIntegration();
  }
})();
