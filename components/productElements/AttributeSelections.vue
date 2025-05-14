<script lang="ts" setup>
import { ref, computed, watch, PropType, toRaw } from "vue";

// Import StockStatusEnum as a value for runtime access.
import { StockStatusEnum } from "#woo";
import type {
  Variation as WooVariation,
  Attribute as WooProductAttribute,
  VariationAttribute as WooVariationAttribute,
  TermNode, // Assuming TermNode is exported or define it if not
} from "#woo";

// --- Local Type Definitions ---
// Define TermNode if not properly exported/typed by #woo, e.g.:
// interface TermNode {
//   name: string;
//   slug: string;
//   taxonomyName?: string; // Optional
//   databaseId?: number; // Optional
// }

interface VariationAttributeNode extends WooVariationAttribute {}

interface VariationNode extends WooVariation {
  attributes?: {
    nodes: VariationAttributeNode[];
  } | null;
}

interface ProductAttributeNode extends WooProductAttribute {
  terms?: {
    nodes: TermNode[];
  } | null;
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
const selectedOptions = ref<Record<string, string>>({}); // Stores selected slugs, keyed by normalized attribute name

// --- Helper Functions ---

/**
 * Formats a slug for display according to specified rules:
 * 1. Capitalizes "eu" to "EU".
 * 2. Inserts decimals for patterns like "N-D" -> "N.D" (e.g., "35-5eu" -> "35.5EU").
 * 3. Inserts decimals for patterns like "XY5" -> "XY.5" within segments (e.g., "36-425eu" -> "36-42.5EU").
 * @param slug The original slug string.
 */
const formatSlugForDisplayWorkaround = (slug: string): string => {
  if (!slug) return "";

  let formattedSlug = slug.toLowerCase();

  // Step 1: Handle cases like "N-D" -> "N.D" where D is a single digit not followed by another digit.
  // This specifically targets hyphens followed by a single digit.
  // Example: "43-5-44-5eu" -> "43.5-44.5eu", "35-5eu" -> "35.5eu"
  formattedSlug = formattedSlug.replace(/(\d+)-(\d)(?![0-9])/g, "$1.$2");

  // Step 2: Handle cases like "XYZ" -> "XY.Z" if Z is 5, for segments.
  // This is to address "36-425eu" -> "36-42.5eu" and "25-36-425euadjustable" -> "25-36-42.5euadjustable".
  // It processes parts of the slug that are separated by hyphens.
  const parts = formattedSlug.split("-");
  const processedParts = parts.map((part) => {
    // If the part already contains a decimal (from Step 1), leave it.
    if (part.includes(".")) return part;

    // Try to match a numeric prefix and any following non-numeric suffix (like 'eu', 'adjustable')
    const numericPartMatch = part.match(/^(\d+)(.*)$/);
    if (numericPartMatch) {
      let numStr = numericPartMatch[1]; // e.g., "425"
      const restOfPart = numericPartMatch[2]; // e.g., "eu", "euadjustable", or ""

      // If the numeric string has at least two digits and ends with '5',
      // insert a decimal before the '5'. Handles "425" -> "42.5".
      // Does not affect "35" -> "3.5" if "35" is a whole segment (Step 1 handles "X-5").
      // Does not affect "5" if "5" is a whole segment.
      if (numStr.length >= 2 && numStr.endsWith("5")) {
        const charBeforeLast = numStr.charAt(numStr.length - 2);
        // Ensure the character before '5' is also a digit (e.g., "X5", "XX5")
        if (charBeforeLast >= "0" && charBeforeLast <= "9") {
          numStr = numStr.slice(0, -1) + "." + numStr.slice(-1);
        }
      }
      return numStr + restOfPart;
    }
    return part; // Not a primarily numeric part, or doesn't fit the pattern for this step
  });
  formattedSlug = processedParts.join("-");

  // Step 3: Capitalize "eu" to "EU" globally
  formattedSlug = formattedSlug.replace(/eu/g, "EU");

  return formattedSlug;
};

const normalizeAttributeName = (name?: string): string => {
  if (!name) return "";
  const lowerName = name.toLowerCase().trim();
  const productLevelAttribute = props.attributes.find((attr) => {
    const attrNameLower = attr.name?.toLowerCase().trim();
    if (!attrNameLower) return false;
    return (
      attrNameLower === lowerName ||
      attrNameLower === `pa_${lowerName}` ||
      (lowerName.startsWith("pa_") && attrNameLower === lowerName.substring(3))
    );
  });
  if (productLevelAttribute?.name) return productLevelAttribute.name;
  return lowerName.startsWith("pa_") ? lowerName : `pa_${lowerName}`;
};

const isOptionAvailable = (
  attributeNameToEvaluate: string,
  optionSlugToEvaluate: string
): boolean => {
  if (!props.variations || props.variations.length === 0) return false;
  const normalizedAttrNameToEvaluate = normalizeAttributeName(
    attributeNameToEvaluate
  );

  return props.variations.some((variation) => {
    const stockStatusValue = variation.stockStatus;
    const isVariationInStock =
      stockStatusValue?.toUpperCase() === StockStatusEnum.IN_STOCK ||
      stockStatusValue?.toUpperCase() === StockStatusEnum.ON_BACKORDER;
    if (!isVariationInStock) return false;

    let variationContainsOptionToEvaluate = false;
    variation.attributes?.nodes?.forEach((varAttr) => {
      if (
        normalizeAttributeName(varAttr.name) === normalizedAttrNameToEvaluate &&
        varAttr.value?.toLowerCase() === optionSlugToEvaluate.toLowerCase()
      ) {
        variationContainsOptionToEvaluate = true;
      }
    });
    if (!variationContainsOptionToEvaluate) return false;

    for (const selectedNormalizedAttrName in selectedOptions.value) {
      if (selectedNormalizedAttrName === normalizedAttrNameToEvaluate) continue;
      const selectedValueForOtherAttr =
        selectedOptions.value[selectedNormalizedAttrName];
      let variationMatchesOtherSelectedAttr = false;
      variation.attributes?.nodes?.forEach((varAttr) => {
        if (
          normalizeAttributeName(varAttr.name) === selectedNormalizedAttrName &&
          varAttr.value?.toLowerCase() ===
            selectedValueForOtherAttr.toLowerCase()
        ) {
          variationMatchesOtherSelectedAttr = true;
        }
      });
      if (!variationMatchesOtherSelectedAttr) return false;
    }
    return true;
  });
};

// --- Event Handlers ---
const handleOptionSelect = (
  productLevelAttributeName: string,
  optionSlug: string
) => {
  const normalizedNameKey = normalizeAttributeName(productLevelAttributeName);
  const newSelectedOptions = { ...toRaw(selectedOptions.value) };
  if (newSelectedOptions[normalizedNameKey] !== optionSlug) {
    newSelectedOptions[normalizedNameKey] = optionSlug;
  }
  selectedOptions.value = newSelectedOptions;
  const selectedAttributesForEmit = Object.entries(selectedOptions.value).map(
    ([name, value]) => ({ name, value })
  );
  emit("attrs-changed", selectedAttributesForEmit);
};

// --- Computed Properties ---
const displayAttributes = computed(() => {
  if (!props.attributes) {
    return [];
  }
  return props.attributes.map((productAttribute) => {
    const originalAttributeName = productAttribute.name;
    const normalizedForSelectionKey = normalizeAttributeName(
      originalAttributeName
    );

    const termNameMap = new Map<string, string>();
    if (productAttribute.terms?.nodes) {
      productAttribute.terms.nodes.forEach((term) => {
        if (term.slug && term.name) {
          const lowerTermSlug = term.slug.toLowerCase();
          termNameMap.set(lowerTermSlug, term.name);
        }
      });
    }

    const optionsForDisplay = productAttribute.options.map((optionSlug) => {
      const lowerOptionSlug = optionSlug.toLowerCase();
      let displayName = termNameMap.get(lowerOptionSlug);

      if (!displayName) {
        // console.warn(`[AttrsSelect] For attribute '${originalAttributeName}', slug '${optionSlug}' not found in terms.nodes. Applying workaround formatting.`);
        displayName = formatSlugForDisplayWorkaround(optionSlug); // Apply workaround
      }

      const isSel =
        selectedOptions.value[normalizedForSelectionKey]?.toLowerCase() ===
        lowerOptionSlug;
      return {
        value: optionSlug,
        displayName: displayName,
        available: isOptionAvailable(originalAttributeName, optionSlug),
        selected: isSel,
      };
    });
    return {
      ...productAttribute,
      keyForSelection: normalizedForSelectionKey,
      displayOptions: optionsForDisplay,
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
        const originalAttrName = attr.name;
        const normalizedAttrNameKey = normalizeAttributeName(originalAttrName);
        const defaultAttr = newDefaultAttributes?.find(
          (da) => normalizeAttributeName(da.name) === normalizedAttrNameKey
        );

        if (
          defaultAttr?.value &&
          isOptionAvailable(originalAttrName, defaultAttr.value)
        ) {
          initialSelections[normalizedAttrNameKey] = defaultAttr.value;
        } else {
          const currentSelectionsForAvailabilityCheck = {
            ...initialSelections,
          };
          const firstAvailableOptionSlug = attr.options.find((optSlug) => {
            const originalSelectedOptionsSnapshot = {
              ...selectedOptions.value,
            };
            selectedOptions.value = currentSelectionsForAvailabilityCheck;
            const available = isOptionAvailable(originalAttrName, optSlug);
            selectedOptions.value = originalSelectedOptionsSnapshot;
            return available;
          });
          if (firstAvailableOptionSlug) {
            initialSelections[normalizedAttrNameKey] = firstAvailableOptionSlug;
          }
        }
      });
    }
    selectedOptions.value = initialSelections;
    if (Object.keys(initialSelections).length > 0) {
      const selectedAttributesForEmit = Object.entries(initialSelections).map(
        ([name, value]) => ({ name, value })
      );
      emit("attrs-changed", selectedAttributesForEmit);
    }
  },
  { immediate: true, deep: true }
);

const t = (key: string, fallback: string): string => fallback; // Placeholder
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
              selectedOptions[attribute.keyForSelection]
                ? attribute.displayOptions.find(
                    (opt) =>
                      opt.value.toLowerCase() ===
                      selectedOptions[attribute.keyForSelection]?.toLowerCase()
                  )?.displayName ||
                  formatSlugForDisplayWorkaround(
                    selectedOptions[attribute.keyForSelection]
                  )
                : t("messages.shop.selectOption", "Select")
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
              :aria-label="`${attribute.label || attribute.name}: ${option.displayName}`"
            >
              {{ option.displayName }}
            </button>
          </template>
        </div>
      </div>
    </template>
    <div
      v-if="
        !displayAttributes ||
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
.attribute-group {
  /* Example: margin or padding for individual groups */
}
</style>
