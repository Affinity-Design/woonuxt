<script lang="ts" setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";

// --- Recommended: Define more specific types ---
interface Term {
  slug: string;
  name: string;
  // any other properties a term might have
}

interface AttributeSchema {
  // Renamed from Attribute to avoid conflict with DOM Attribute
  name: string; // e.g., "pa_color" or "Color"
  label: string; // e.g., "Color"
  terms?: { nodes: Term[] };
  // any other properties an attribute might have
}

interface VariationAttributeNode {
  // Attribute of a specific variation
  name: string; // e.g., "pa_color"
  value: string; // e.g., "red" (slug)
}

interface Variation {
  id?: string;
  attributes?: { nodes: VariationAttributeNode[] };
  // other variation properties like price, stock_status, image etc.
}

interface Props {
  attributes: AttributeSchema[];
  variations: Variation[];
  defaultAttributes?: { nodes: VariationAttributeNode[] } | null;
}
// --- End Recommended Types ---

const props = defineProps<Props>();
const emit = defineEmits(["attrs-changed"]);

const selectedAttributeValues = ref<Record<string, string>>({}); // Key: attribute.id, Value: term.slug

const formatAttributeName = (name: string | undefined): string => {
  if (!name) return "";
  return name.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase(); // Allow hyphens, make lowercase for consistency
};

const displayableAttributes = computed(() => {
  const { attributes, variations } = props;
  if (
    !attributes ||
    attributes.length === 0 ||
    !variations ||
    variations.length === 0
  ) {
    return [];
  }

  const usedAttributeTerms = new Map<string, Set<string>>();

  variations.forEach((variation) => {
    variation.attributes?.nodes?.forEach((varAttr) => {
      if (varAttr.name && varAttr.value) {
        const normalizedVarAttrName = varAttr.name.toLowerCase();
        if (!usedAttributeTerms.has(normalizedVarAttrName)) {
          usedAttributeTerms.set(normalizedVarAttrName, new Set());
        }
        usedAttributeTerms.get(normalizedVarAttrName)!.add(varAttr.value);
      }
    });
  });

  const result = attributes
    .map((attr) => {
      if (!attr.name) return null;
      const normalizedAttrName = attr.name.toLowerCase();

      if (usedAttributeTerms.has(normalizedAttrName)) {
        const availableTermSlugs = usedAttributeTerms.get(normalizedAttrName)!;
        const availableTerms = (attr.terms?.nodes || []).filter(
          (term) => term.slug && availableTermSlugs.has(term.slug)
        );

        if (availableTerms.length > 0) {
          return {
            originalName: attr.name, // Keep original name if needed for emitting
            label: attr.label || attr.name,
            id: formatAttributeName(attr.name), // Unique ID for v-model binding and DOM
            terms: availableTerms, // Filtered list of available terms
          };
        }
      }
      return null;
    })
    .filter(Boolean);

  return result as {
    originalName: string;
    label: string;
    id: string;
    terms: Term[];
  }[];
});

const getSelectedTermName = (
  attributeId: string,
  attributeTerms: Term[]
): string => {
  const selectedSlug = selectedAttributeValues.value[attributeId];
  if (!selectedSlug) return "";
  const selectedTerm = attributeTerms.find(
    (term) => term.slug === selectedSlug
  );
  return selectedTerm?.name || selectedSlug;
};

const updateAttrs = () => {
  const selectionsForEmit: VariationAttributeNode[] =
    displayableAttributes.value
      .map((attr) => ({
        name: attr.originalName, // Use the original attribute name for consistency with backend
        value: selectedAttributeValues.value[attr.id] || "",
      }))
      .filter((selection) => selection.value !== ""); // Optionally filter out non-selected attributes

  // Or, if you always need to emit all displayable attributes:
  // const selectionsForEmit: VariationAttributeNode[] = displayableAttributes.value.map(attr => ({
  //   name: attr.originalName,
  //   value: selectedAttributeValues.value[attr.id] || "",
  // }));

  emit("attrs-changed", selectionsForEmit);
};

const initializeSelections = () => {
  const newSelectedValues: Record<string, string> = {};
  displayableAttributes.value.forEach((attr) => {
    newSelectedValues[attr.id] = ""; // Initialize with empty selection
  });

  if (props.defaultAttributes?.nodes) {
    props.defaultAttributes.nodes.forEach((defaultAttr) => {
      if (defaultAttr.name && defaultAttr.value) {
        const formattedName = formatAttributeName(defaultAttr.name);
        const displayableAttr = displayableAttributes.value.find(
          (da) => da.id === formattedName
        );
        // Ensure the default attribute is displayable and its value (term slug) is among the available terms
        if (
          displayableAttr &&
          displayableAttr.terms.some((term) => term.slug === defaultAttr.value)
        ) {
          newSelectedValues[formattedName] = defaultAttr.value;
        }
      }
    });
  }
  selectedAttributeValues.value = newSelectedValues;

  // If there were defaults applied that constitute a full selection,
  // or if an initial emit is always desired:
  updateAttrs(); // Call updateAttrs to emit initial state or default selections
};

onMounted(() => {
  nextTick(() => {
    initializeSelections();
  });
});

// Watch for prop changes to re-initialize if necessary
watch(
  () => [props.attributes, props.variations, props.defaultAttributes],
  () => {
    nextTick(() => {
      // Ensure displayableAttributes has recomputed
      initializeSelections();
    });
  },
  { deep: true }
);
</script>

<template>
  <div v-if="displayableAttributes.length > 0">
    <div
      v-for="attribute in displayableAttributes"
      :key="attribute.id"
      class="flex flex-col gap-1 justify-between mb-4"
    >
      <div class="text-sm">
        {{ attribute.label }}
        <span
          v-if="selectedAttributeValues[attribute.id]"
          class="text-gray-400"
        >
          {{ getSelectedTermName(attribute.id, attribute.terms) }}
        </span>
      </div>
      <select
        :id="attribute.id"
        :name="attribute.originalName"
        v-model="selectedAttributeValues[attribute.id]"
        required
        class="border-white shadow rounded p-2"
        @change="updateAttrs"
      >
        <option value="" disabled>
          {{ $t("messages.general.choose") }}
          {{ attribute.label ? decodeURIComponent(attribute.label) : "" }}
        </option>
        <option
          v-for="term in attribute.terms"
          :key="term.slug"
          :value="term.slug"
          v-html="term.name"
        />
      </select>
    </div>
  </div>
  <div v-else class="text-sm text-gray-500">
    {{
      $t("messages.shop.noVariationsRequired") ||
      "No attributes available for this product configuration."
    }}
  </div>
</template>

<style lang="postcss">
/* Your existing styles should largely remain compatible */
.radio-button {
  @apply border-transparent border-white rounded-lg cursor-pointer outline bg-gray-50 border-2 text-sm text-center outline-2 outline-gray-100 py-1.5 px-3 transition-all text-gray-800 inline-block hover:outline-gray-500;
}

.color-button {
  @apply border-transparent border-white cursor-pointer outline bg-gray-50 border-2 rounded-2xl text-sm text-center outline-2 outline-gray-100 transition-all text-gray-800 inline-block hover:outline-gray-500;
  width: 2rem;
  height: 2rem;
}

/* ... other color styles ... */
.color-black {
  @apply bg-black;
}

input[type="radio"]:checked ~ span {
  @apply outline outline-2 outline-gray-500;
}
</style>
