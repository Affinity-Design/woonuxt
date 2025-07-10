/* WooCommerce Analytics Origin Filter - Diagnostic Script */
(function () {
  "use strict";

  console.log("=== PG ORIGIN DIAGNOSTIC START ===");

  // Check what page we're on
  console.log("Current URL:", window.location.href);
  console.log(
    "Page parameters:",
    new URLSearchParams(window.location.search).get("page")
  );

  // Check WordPress dependencies
  console.log("WordPress objects available:");
  console.log("- wp:", typeof wp);
  console.log("- wp.hooks:", typeof wp?.hooks);
  console.log("- wp.element:", typeof wp?.element);
  console.log("- wp.components:", typeof wp?.components);
  console.log("- wp.data:", typeof wp?.data);

  // Check WooCommerce objects
  console.log("WooCommerce objects available:");
  console.log("- wc:", typeof wc);
  console.log("- wc.components:", typeof wc?.components);
  console.log("- wc.data:", typeof wc?.data);

  // Check our data
  console.log("Plugin data:");
  console.log("- pgOriginData:", typeof pgOriginData, pgOriginData);

  // List all available filter hooks
  if (typeof wp !== "undefined" && wp.hooks) {
    const { addFilter, addAction } = wp.hooks;

    console.log("=== ATTEMPTING HOOK REGISTRATION ===");

    // List of possible hooks to try
    const possibleHooks = [
      "woocommerce_admin_analytics_orders_advanced_filters",
      "woocommerce_analytics_orders_advanced_filters",
      "wc_admin_analytics_orders_advanced_filters",
      "woocommerce_admin_analytics_orders_filters",
      "woocommerce_analytics_orders_filters",
      "wc_admin_analytics_orders_filters",
      "woocommerce_admin_reports_filters",
      "wc_admin_reports_filters",
    ];

    possibleHooks.forEach(function (hookName) {
      addFilter(
        hookName,
        "pg-origin-diagnostic/" + hookName,
        function (filters) {
          console.log("🎯 HOOK TRIGGERED:", hookName);
          console.log("Filters received:", filters);
          console.log(
            "Filter type:",
            Array.isArray(filters) ? "Array" : typeof filters
          );

          // Try to add our filter regardless of format
          if (Array.isArray(filters)) {
            console.log("Adding to array format");
            filters.push({
              label: "Origin (Diagnostic)",
              param: "pg_origin_test",
              component: "SelectControl",
            });
          } else if (typeof filters === "object" && filters !== null) {
            console.log("Adding to object format");
            filters.pg_origin_test = {
              title: "Origin (Diagnostic)",
              filters: {
                pg_origin_test: {
                  allowMultiple: false,
                  labels: {
                    add: "Order Origin Test",
                    placeholder: "Select origin",
                    rule: "Origin is",
                    title: "Origin: {{filter}}",
                    filter: "{{filter}}",
                  },
                  rules: [{ value: "is", label: "Is" }],
                  input: {
                    component: "SelectControl",
                    options: [
                      { label: "Test Option 1", value: "test1" },
                      { label: "Test Option 2", value: "test2" },
                    ],
                  },
                },
              },
            };
          }

          return filters;
        }
      );
    });

    // Also try some action hooks
    const possibleActions = [
      "woocommerce_admin_analytics_orders_init",
      "wc_admin_analytics_orders_init",
      "woocommerce_analytics_init",
    ];

    possibleActions.forEach(function (actionName) {
      addAction(actionName, "pg-origin-diagnostic/" + actionName, function () {
        console.log("🚀 ACTION TRIGGERED:", actionName);
      });
    });
  }

  // Monitor DOM for Analytics elements
  function checkForAnalyticsElements() {
    const analyticsElements = [
      '[class*="analytics"]',
      '[class*="woocommerce"]',
      '[class*="filter"]',
      "[data-automation-id]",
      ".woocommerce-filters",
      ".wc-analytics-filters",
    ];

    analyticsElements.forEach(function (selector) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(
          `Found ${elements.length} elements for selector: ${selector}`
        );
        elements.forEach(function (el, index) {
          if (index < 3) {
            // Only log first 3 to avoid spam
            console.log(`  - ${el.tagName}.${el.className}`);
          }
        });
      }
    });
  }

  // Check immediately and after DOM changes
  checkForAnalyticsElements();

  // Monitor for DOM changes
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(function (node) {
          if (
            node.nodeType === 1 &&
            node.className &&
            typeof node.className === "string" &&
            (node.className.includes("analytics") ||
              node.className.includes("woocommerce") ||
              node.className.includes("filter"))
          ) {
            console.log(
              "New analytics element added:",
              node.tagName,
              node.className
            );
            checkForAnalyticsElements();
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("=== PG ORIGIN DIAGNOSTIC END ===");
  console.log("Check browser console for hook triggers and DOM elements");
})();
