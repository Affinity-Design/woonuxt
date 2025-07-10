/* WooCommerce Analytics Orders Origin Filter - Modern SlotFill Approach */
(function () {
  "use strict";

  console.log("PG-Origin Analytics: Initializing modern filter...");

  function initModernOriginFilter() {
    // Check for required dependencies
    if (
      typeof wp === "undefined" ||
      !wp.element ||
      !wp.components ||
      !wp.data ||
      !wp.hooks ||
      typeof wc === "undefined" ||
      !wc.components
    ) {
      console.log("PG-Origin Analytics: Dependencies not ready, retrying...");
      setTimeout(initModernOriginFilter, 200);
      return;
    }

    // Check for origin data
    if (typeof pgOriginData === "undefined") {
      console.warn("PG-Origin Analytics: Origin data not available");
      return;
    }

    const { createElement, Fragment } = wp.element;
    const { SelectControl, Card, CardBody } = wp.components;
    const { addFilter } = wp.hooks;
    const { AdvancedFilters } = wc.components;

    console.log("PG-Origin Analytics: All dependencies ready");
    console.log("Available origin data:", pgOriginData);

    // Register the advanced filter
    addFilter(
      "woocommerce_admin_analytics_orders_advanced_filters",
      "pg-origin/add-advanced-filter",
      function (filters) {
        console.log("PG-Origin Analytics: Registering advanced filter");

        return {
          ...filters,
          pg_origin: {
            title: "Origin",
            filters: {
              pg_origin: {
                allowMultiple: false,
                labels: {
                  add: "Order Origin",
                  placeholder: "Select origin",
                  rule: "Select origin is",
                  title: "Origin: {{rule}} {{filter}}",
                  filter: "{{rule}} {{filter}}",
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
          },
        };
      }
    );

    // Register query modification
    addFilter(
      "woocommerce_admin_analytics_orders_query_args",
      "pg-origin/modify-query",
      function (query, urlQuery) {
        console.log("PG-Origin Analytics: Query modification filter", {
          query,
          urlQuery,
        });

        if (urlQuery.pg_origin && urlQuery.pg_origin !== "") {
          // Add meta query for origin filtering
          if (!query.meta_query) {
            query.meta_query = [];
          }

          query.meta_query.push({
            key: "pg_origin",
            value: urlQuery.pg_origin,
            compare: "=",
          });

          console.log(
            "PG-Origin Analytics: Added meta query for origin:",
            urlQuery.pg_origin
          );
        }

        return query;
      }
    );

    // Alternative approach: Register as a custom filter component
    addFilter(
      "woocommerce_admin_analytics_orders_filters",
      "pg-origin/add-select-filter",
      function (filters) {
        console.log("PG-Origin Analytics: Adding select filter");

        const OriginFilter = function (props) {
          const { query, onFilterUpdate } = props;

          return createElement(
            Card,
            { className: "woocommerce-filters-filter" },
            createElement(
              CardBody,
              null,
              createElement(SelectControl, {
                label: "Filter by Origin",
                value: query.pg_origin || "",
                options: [{ label: "All origins", value: "" }, ...pgOriginData],
                onChange: function (value) {
                  console.log("PG-Origin Analytics: Filter changed to:", value);
                  onFilterUpdate({ pg_origin: value });
                },
              })
            )
          );
        };

        if (Array.isArray(filters)) {
          return [
            ...filters,
            {
              key: "pg_origin",
              component: OriginFilter,
              label: "Origin",
            },
          ];
        }

        return {
          ...filters,
          pg_origin: {
            component: OriginFilter,
            label: "Origin",
          },
        };
      }
    );

    console.log("PG-Origin Analytics: Modern filter registration complete");
  }

  // Initialize when ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModernOriginFilter);
  } else {
    initModernOriginFilter();
  }
})();
