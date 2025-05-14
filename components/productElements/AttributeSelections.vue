<script lang="ts" setup>
import { ref, computed, watch, PropType, toRaw } from "vue";

// Import StockStatusEnum as a value for runtime access.
// Other types that are only used for type annotations can remain type-only imports.
import { StockStatusEnum } from "#woo";
import type {
  Variation as WooVariation,
  Attribute as WooProductAttribute,
  VariationAttribute as WooVariationAttribute,
} from "#woo";

// --- Local Type Definitions (align with your #woo types or GraphQL schema) ---

// Represents an attribute on a specific variation (e.g., Color: Blue)
interface VariationAttributeNode extends WooVariationAttribute {
  // Inherits name, value from WooVariationAttribute
}

// Represents a single product variation
interface VariationNode extends WooVariation {
  // Inherits databaseId, name, stockStatus, salePrice, regularPrice, image, etc.
  attributes?: {
    nodes: VariationAttributeNode[];
  } | null;
}

// Represents a product attribute definition (e.g., Color with options Red, Blue, Green)
interface ProductAttributeNode extends WooProductAttribute {
  // Inherits name, label, options from WooProductAttribute
  // Ensure 'options' is an array of strings: string[]
}

// --- Component Props ---

const props = defineProps({
  attributes: {
    type: Array as PropType<ProductAttributeNode[]>,
    required: true,
  },
  variations: {
    type: Array as PropType<VariationNode[]>,
    required: true,
  },
  defaultAttributes: {
    type: Array as PropType<WooVariationAttribute[]>,
    default: () => [],
  },
});

// --- Component Emits ---

const emit = defineEmits<{
  (
    e: "attrs-changed",
    selectedAttributes: { name: string; value: string }[]
  ): void;
}>();

// --- Internal State ---

const selectedOptions = ref<Record<string, string>>({});

// --- Helper Functions ---

const normalizeAttributeName = (name?: string): string => {
  if (!name) return "";
  const lowerName = name.toLowerCase().trim();
  // Find the canonical name from props.attributes to ensure consistency (e.g. 'pa_color' vs 'Color')
  const productLevelAttribute = props.attributes.find(
    (attr) =>
      attr.name?.toLowerCase().trim() === lowerName ||
      attr.name?.toLowerCase().trim() === `pa_${lowerName}` || // Handles if lowerName is 'color' and attr.name is 'pa_color'
      (attr.name &&
        lowerName.startsWith("pa_") &&
        attr.name.toLowerCase().trim() === lowerName.substring(3)) // Handles if lowerName is 'pa_color' and attr.name is 'color'
  );
  if (productLevelAttribute?.name) return productLevelAttribute.name;

  // Fallback if no direct match on props.attributes (should be rare if data is consistent)
  // This ensures that if we get 'Color', we try 'pa_color' for matching against variation attributes
  return lowerName.startsWith("pa_") ? lowerName : `pa_${lowerName}`;
};

const isOptionAvailable = (
  attributeNameToEvaluate: string,
  optionValueToEvaluate: string
): boolean => {
  if (!props.variations || props.variations.length === 0) {
    return false;
  }

  const normalizedAttrNameToEvaluate = normalizeAttributeName(
    attributeNameToEvaluate
  );

  return props.variations.some((variation) => {
    const stockStatusUpper = variation.stockStatus?.toUpperCase();
    const isVariationInStock =
      StockStatusEnum &&
      (stockStatusUpper === StockStatusEnum.IN_STOCK ||
        stockStatusUpper === StockStatusEnum.ON_BACKORDER);

    if (!isVariationInStock) {
      return false;
    }

    let variationContainsOptionToEvaluate = false;
    variation.attributes?.nodes?.forEach((varAttr) => {
      // Normalize varAttr.name as well for consistent comparison
      if (
        normalizeAttributeName(varAttr.name) === normalizedAttrNameToEvaluate &&
        varAttr.value?.toLowerCase() === optionValueToEvaluate.toLowerCase()
      ) {
        variationContainsOptionToEvaluate = true;
      }
    });

    if (!variationContainsOptionToEvaluate) {
      return false;
    }

    for (const selectedNormalizedAttrName in selectedOptions.value) {
      if (selectedNormalizedAttrName === normalizedAttrNameToEvaluate) {
        continue;
      }
      const selectedValueForOtherAttr =
        selectedOptions.value[selectedNormalizedAttrName];
      const variationMatchesOtherSelectedAttr =
        variation.attributes?.nodes?.some(
          (varAttr) =>
            normalizeAttributeName(varAttr.name) ===
              selectedNormalizedAttrName &&
            varAttr.value?.toLowerCase() ===
              selectedValueForOtherAttr.toLowerCase()
        );
      if (!variationMatchesOtherSelectedAttr) {
        return false;
      }
    }
    return true;
  });
};

// --- Event Handlers ---

const handleOptionSelect = (
  productLevelAttributeName: string,
  optionValue: string
) => {
  const normalizedNameKey = normalizeAttributeName(productLevelAttributeName); // Use the name from props.attributes as the key

  // Create a new object for selectedOptions to ensure reactivity
  const newSelectedOptions = { ...toRaw(selectedOptions.value) };

  if (newSelectedOptions[normalizedNameKey] === optionValue) {
    // If the option is already selected, deselect it (optional: toggle behavior)
    // delete newSelectedOptions[normalizedNameKey]; // Uncomment to enable toggle
  } else {
    newSelectedOptions[normalizedNameKey] = optionValue;
  }
  selectedOptions.value = newSelectedOptions;

  const selectedAttributesForEmit = Object.entries(selectedOptions.value).map(
    ([name, value]) => ({ name, value })
  ); // name here will be the normalized key
  emit("attrs-changed", selectedAttributesForEmit);
};

// --- Computed Properties ---

const displayAttributes = computed(() => {
  if (!props.attributes) return [];
  return props.attributes.map((productAttribute) => {
    // Use the original name from props.attributes for display and as the primary reference
    const originalAttributeName = productAttribute.name;
    const normalizedForSelectionKey = normalizeAttributeName(
      originalAttributeName
    );

    return {
      ...productAttribute, // Includes original name, label, options
      keyForSelection: normalizedForSelectionKey, // The key used in selectedOptions
      displayOptions: productAttribute.options.map((optionValue) => ({
        value: optionValue,
        available: isOptionAvailable(originalAttributeName, optionValue),
        selected:
          selectedOptions.value[normalizedForSelectionKey]?.toLowerCase() ===
          optionValue.toLowerCase(),
      })),
    };
  });
});

// --- Watchers ---

watch(
  () => [props.attributes, props.defaultAttributes],
  ([newAttributes, newDefaultAttributes]) => {
    const initialSelections: Record<string, string> = {};
    if (newAttributes && newAttributes.length > 0) {
      newAttributes.forEach((attr) => {
        const originalAttrName = attr.name; // Use the original name from product attribute definition
        const normalizedAttrNameKey = normalizeAttributeName(originalAttrName); // Key for selectedOptions

        const defaultAttr = newDefaultAttributes?.find(
          (da) => normalizeAttributeName(da.name) === normalizedAttrNameKey // Compare normalized names
        );

        if (
          defaultAttr?.value &&
          isOptionAvailable(originalAttrName, defaultAttr.value)
        ) {
          initialSelections[normalizedAttrNameKey] = defaultAttr.value;
        } else {
          // If no valid default, try to select the first available option for this attribute
          // considering previously made initial selections for prior attributes.
          const currentSelectionsForAvailabilityCheck = {
            ...initialSelections,
          };
          const firstAvailableOption = attr.options.find((opt) => {
            const originalSelectedOptionsSnapshot = {
              ...selectedOptions.value,
            };
            selectedOptions.value = currentSelectionsForAvailabilityCheck; // Temporarily set for isOptionAvailable
            const available = isOptionAvailable(originalAttrName, opt);
            selectedOptions.value = originalSelectedOptionsSnapshot; // Restore
            return available;
          });

          if (firstAvailableOption) {
            initialSelections[normalizedAttrNameKey] = firstAvailableOption;
          }
        }
      });
    }
    selectedOptions.value = initialSelections;

    if (Object.keys(initialSelections).length > 0) {
      const selectedAttributesForEmit = Object.entries(initialSelections).map(
        ([name, value]) => ({ name, value })
      ); // 'name' here is the normalized key
      emit("attrs-changed", selectedAttributesForEmit);
    }
  },
  { immediate: true, deep: true }
);

// Placeholder for t function if useI18n is not set up in this specific component
// In a real Nuxt app, this would typically come from useI18n()
const t = (key: string, fallback: string): string => fallback;
</script>

<template>
  <div class="space-y-5 attribute-selections">
    <template v-for="attribute in displayAttributes" :key="attribute.name">
      <div
        v-if="attribute.displayOptions.some((opt) => opt.available)"
        class="attribute-group"
      >
        <h3 class="text-sm font-semibold text-gray-800 mb-2">
          {{ attribute.label || attribute.name }}:
          <span class="text-gray-600 font-normal ml-1">
            {{
              selectedOptions[attribute.keyForSelection] ||
              t("messages.shop.selectOption", "Select")
            }}
          </span>
        </h3>
        <div class="flex flex-wrap gap-2">
          <template
            v-for="option in attribute.displayOptions"
            :key="option.value"
          >
            <button
              v-if="option.available"
              type="button"
              @click="handleOptionSelect(attribute.name, option.value)"
              class="px-3 py-1.5 border rounded-lg text-xs sm:text-sm transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-1"
              :class="[
                option.selected
                  ? 'bg-primary text-white border-primary-dark ring-primary ring-1'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50 focus:ring-primary-focus',
              ]"
              :aria-pressed="option.selected"
              :aria-label="`${attribute.label || attribute.name}: ${option.value}`"
            >
              {{ option.value }}
            </button>
          </template>
        </div>
      </div>
    </template>
    <div
      v-if="
        displayAttributes.length === 0 ||
        displayAttributes.every(
          (attr) => !attr.displayOptions.some((opt) => opt.available)
        )
      "
      class="text-sm text-gray-500"
    >
      {{
        t(
          "messages.shop.noOptionsAvailable",
          "No options available for this product."
        )
      }}
    </div>
  </div>
</template>

<style scoped>
/* Add any component-specific styles here if needed. Tailwind utility classes are used primarily. */
.attribute-selections {
  /* Example: could add a border or specific spacing if not handled by parent */
}
.attribute-group {
  /* Example: margin or padding for individual groups */
}
</style>
