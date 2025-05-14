<script lang="ts" setup>
import { ref, computed, watch, PropType, toRaw } from "vue";

// Import StockStatusEnum as a value for runtime access.
// Other types that are only used for type annotations can remain type-only imports.
import { StockStatusEnum } from "#woo";
import type {
  Variation as WooVariation,
  Attribute as WooProductAttribute,
  VariationAttribute as WooVariationAttribute,
  TermNode, // Assuming TermNode is exported or define it if not
} from "#woo";

// --- Local Type Definitions (align with your #woo types or GraphQL schema) ---

// If TermNode is not exported from #woo, you might need a local definition:
// interface TermNode {
//   name: string;
//   slug: string;
//   taxonomyName?: string;
//   databaseId?: number;
// }

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
  terms?: {
    // This structure comes from your log
    nodes: TermNode[]; // Array of term objects, each having a name and a slug
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

const selectedOptions = ref<Record<string, string>>({});
// console.log('[AttrsSelect] Initialized. Props received:', { attributes: JSON.parse(JSON.stringify(props.attributes)), variations: props.variations.length, defaultAttributes: props.defaultAttributes });

// --- Helper Functions ---

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

  if (productLevelAttribute?.name) {
    return productLevelAttribute.name;
  }
  return lowerName.startsWith("pa_") ? lowerName : `pa_${lowerName}`;
};

const isOptionAvailable = (
  attributeNameToEvaluate: string,
  optionSlugToEvaluate: string
): boolean => {
  // console.log(`[AttrsSelect] isOptionAvailable: Checking option SLUG '${optionSlugToEvaluate}' for attribute '${attributeNameToEvaluate}'`);
  // console.log(`[AttrsSelect] isOptionAvailable: Current selectedOptions:`, JSON.parse(JSON.stringify(selectedOptions.value)));

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
      // Variation attributes store slugs as their 'value'
      if (
        normalizeAttributeName(varAttr.name) === normalizedAttrNameToEvaluate &&
        varAttr.value?.toLowerCase() === optionSlugToEvaluate.toLowerCase()
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
        selectedOptions.value[selectedNormalizedAttrName]; // This is a slug
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
  optionSlug: string
) => {
  const normalizedNameKey = normalizeAttributeName(productLevelAttributeName);
  // console.log(`[AttrsSelect] handleOptionSelect: Attribute '${productLevelAttributeName}' (normalized: '${normalizedNameKey}'), Option SLUG: '${optionSlug}'`);

  const newSelectedOptions = { ...toRaw(selectedOptions.value) };
  if (newSelectedOptions[normalizedNameKey] === optionSlug) {
    // console.log(`[AttrsSelect] handleOptionSelect: Option SLUG '${optionSlug}' was already selected. No change (toggle disabled).`);
  } else {
    newSelectedOptions[normalizedNameKey] = optionSlug;
  }
  selectedOptions.value = newSelectedOptions;
  // console.log(`[AttrsSelect] handleOptionSelect: Updated selectedOptions (slugs):`, JSON.parse(JSON.stringify(selectedOptions.value)));

  const selectedAttributesForEmit = Object.entries(selectedOptions.value).map(
    ([name, value]) => ({ name, value })
  ); // value here is the slug
  emit("attrs-changed", selectedAttributesForEmit);
  // console.log(`[AttrsSelect] handleOptionSelect: Emitted 'attrs-changed' (slugs):`, selectedAttributesForEmit);
};

// --- Computed Properties ---

const displayAttributes = computed(() => {
  // console.log('[AttrsSelect] Recomputing displayAttributes. Current selectedOptions (slugs):', JSON.parse(JSON.stringify(selectedOptions.value)));
  if (!props.attributes) {
    // console.log('[AttrsSelect] displayAttributes: props.attributes is null/undefined. Returning [].');
    return [];
  }
  return props.attributes.map((productAttribute) => {
    const originalAttributeName = productAttribute.name; // e.g., "pa_size"
    const normalizedForSelectionKey = normalizeAttributeName(
      originalAttributeName
    );

    // Create a lookup map for term names by their slugs for this specific attribute
    const termNameMap = new Map<string, string>();
    if (productAttribute.terms?.nodes) {
      productAttribute.terms.nodes.forEach((term) => {
        if (term.slug && term.name) {
          termNameMap.set(term.slug.toLowerCase(), term.name);
        }
      });
    }
    // console.log(`[AttrsSelect] Term map for ${originalAttributeName}:`, termNameMap);

    const optionsForDisplay = productAttribute.options.map((optionSlug) => {
      // optionSlug is e.g., '35-39-40eu'
      // Get the display name from the term map, fallback to the slug itself if not found
      const displayName =
        termNameMap.get(optionSlug.toLowerCase()) || optionSlug;
      const isSel =
        selectedOptions.value[normalizedForSelectionKey]?.toLowerCase() ===
        optionSlug.toLowerCase();
      // console.log(`[AttrsSelect] Attr: ${originalAttributeName}, Slug: ${optionSlug}, Display: ${displayName}, Selected: ${isSel}`);

      return {
        value: optionSlug, // The actual value (slug) used for logic and as key
        displayName: displayName, // The human-readable name for display
        available: isOptionAvailable(originalAttributeName, optionSlug),
        selected: isSel,
      };
    });
    console.log(
      `[AttrsSelect] displayAttributes: Processed attribute '${originalAttributeName}', Key: '${normalizedForSelectionKey}', Options for display:`,
      optionsForDisplay
    );
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
    // console.log('[AttrsSelect] Watcher triggered for props.attributes/defaultAttributes.');
    // console.log('[AttrsSelect] Watcher: newAttributes count:', newAttributes?.length);
    // console.log('[AttrsSelect] Watcher: newDefaultAttributes count:', newDefaultAttributes?.length);

    const initialSelections: Record<string, string> = {}; // Stores slug values
    if (newAttributes && newAttributes.length > 0) {
      newAttributes.forEach((attr) => {
        const originalAttrName = attr.name;
        const normalizedAttrNameKey = normalizeAttributeName(originalAttrName);
        // console.log(`[AttrsSelect] Watcher: Processing attr '${originalAttrName}' (normalized key: '${normalizedAttrNameKey}') for initial selection.`);

        const defaultAttr = newDefaultAttributes?.find(
          (da) => normalizeAttributeName(da.name) === normalizedAttrNameKey
        );

        if (defaultAttr?.value) {
          // defaultAttr.value is a slug
          // console.log(`[AttrsSelect] Watcher: Found default for '${originalAttrName}': Slug '${defaultAttr.value}'. Checking availability...`);
          if (isOptionAvailable(originalAttrName, defaultAttr.value)) {
            initialSelections[normalizedAttrNameKey] = defaultAttr.value;
            // console.log(`[AttrsSelect] Watcher: Default option SLUG '${defaultAttr.value}' for '${originalAttrName}' is available and selected.`);
          } else {
            // console.log(`[AttrsSelect] Watcher: Default option SLUG '${defaultAttr.value}' for '${originalAttrName}' is NOT available.`);
          }
        } else {
          // console.log(`[AttrsSelect] Watcher: No default found for '${originalAttrName}'. Attempting to select first available.`);
          const currentSelectionsForAvailabilityCheck = {
            ...initialSelections,
          };
          const firstAvailableOptionSlug = attr.options.find((optSlug) => {
            // optSlug from attr.options
            const originalSelectedOptionsSnapshot = {
              ...selectedOptions.value,
            };
            selectedOptions.value = currentSelectionsForAvailabilityCheck;
            const available = isOptionAvailable(originalAttrName, optSlug);
            selectedOptions.value = originalSelectedOptionsSnapshot;
            // if(available) console.log(`[AttrsSelect] Watcher: Option SLUG '${optSlug}' for '${originalAttrName}' is available for initial selection.`);
            return available;
          });

          if (firstAvailableOptionSlug) {
            initialSelections[normalizedAttrNameKey] = firstAvailableOptionSlug;
            // console.log(`[AttrsSelect] Watcher: Selected first available option SLUG '${firstAvailableOptionSlug}' for '${originalAttrName}'.`);
          } else {
            // console.log(`[AttrsSelect] Watcher: No available options found for '${originalAttrName}' to select initially.`);
          }
        }
      });
    }
    selectedOptions.value = initialSelections;
    // console.log('[AttrsSelect] Watcher: Initial selections set (slugs):', JSON.parse(JSON.stringify(initialSelections)));

    if (Object.keys(initialSelections).length > 0) {
      const selectedAttributesForEmit = Object.entries(initialSelections).map(
        ([name, value]) => ({ name, value })
      ); // value here is the slug
      emit("attrs-changed", selectedAttributesForEmit);
      // console.log('[AttrsSelect] Watcher: Emitted initial "attrs-changed" (slugs):', selectedAttributesForEmit);
    }
  },
  { immediate: true, deep: true }
);

// Placeholder for t function if useI18n is not set up in this specific component
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
              selectedOptions[attribute.keyForSelection]
                ? attribute.displayOptions.find(
                    (opt) =>
                      opt.value.toLowerCase() ===
                      selectedOptions[attribute.keyForSelection]?.toLowerCase()
                  )?.displayName || selectedOptions[attribute.keyForSelection]
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
/* Add any component-specific styles here if needed. Tailwind utility classes are used primarily. */
.attribute-selections {
  /* Example: could add a border or specific spacing if not handled by parent */
}
.attribute-group {
  /* Example: margin or padding for individual groups */
}
</style>
