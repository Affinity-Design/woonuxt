<script setup lang="ts">
interface Props {
  attributes: any[];
  variations: any[];
  defaultAttributes?: { nodes: VariationAttribute[] } | null;
}

const { attributes, variations, defaultAttributes } = defineProps<Props>();
const emit = defineEmits(["attrs-changed"]);

const activeVariations = ref<VariationAttribute[]>([]);

// Format attribute name to ensure consistent usage
const formatAttributeName = (name) => {
  if (!name) return "";
  // Remove spaces and special characters for DOM ID usage
  return name.replace(/[^a-zA-Z0-9]/g, "");
};

// Filter attributes to only those used for variations
const requiredAttributes = computed(() => {
  if (!attributes || !variations || variations.length === 0) {
    return [];
  }

  // Get all attribute names used in variations
  const usedAttributeNames = new Set();
  variations.forEach((variation, index) => {
    if (variation.attributes && variation.attributes.nodes) {
      variation.attributes.nodes.forEach((attr) => {
        if (attr.name) {
          usedAttributeNames.add(attr.name.toLowerCase());
        }
      });
    }
  });

  // Filter attributes to only those used in variations
  const required = attributes.filter(
    (attr) => attr.name && usedAttributeNames.has(attr.name.toLowerCase())
  );

  return required;
});
const getSelectedName = (attr: any, activeVariation?: VariationAttribute) => {
  if (!attr?.terms?.nodes || !activeVariation) return "";

  const selected = attr.terms.nodes.find(
    (node: { slug: string }) => node.slug === activeVariation.value
  );

  return selected?.name || activeVariation?.value || "";
};
const updateAttrs = () => {
  try {
    if (!requiredAttributes.value || requiredAttributes.value.length === 0) {
      return;
    }

    const selectedVariations = [];

    // Safely gather all selected variation values
    for (const attr of requiredAttributes.value) {
      if (!attr || !attr.name) continue;

      const formattedName = formatAttributeName(attr.name);
      const selectElement = document.getElementById(formattedName);
      // Normalize attribute name for consistency
      const name = attr.name.charAt(0).toLowerCase() + attr.name.slice(1);
      let value = "";

      if (selectElement instanceof HTMLSelectElement) {
        value = selectElement.value || "";
      } else {
      }

      selectedVariations.push({ name, value });
    }

    activeVariations.value = selectedVariations;
    emit("attrs-changed", selectedVariations);
  } catch (error) {
    console.error("Error updating attributes:", error);
  }
};

const setDefaultAttributes = () => {
  if (!defaultAttributes?.nodes) return;

  try {
    // First, make sure all dropdowns exist
    for (const attr of defaultAttributes.nodes) {
      if (!attr?.name) continue;

      const formattedName = formatAttributeName(attr.name);
      const dropdown = document.querySelector(`#${formattedName}`);

      if (dropdown instanceof HTMLSelectElement && attr.value) {
        dropdown.value = attr.value;
      }
    }

    // After setting defaults, update the activeVariations
    updateAttrs();
  } catch (error) {
    console.error("Error setting default attributes:", error);
  }
};

onMounted(() => {
  // Allow more time for the DOM to fully render
  setTimeout(() => {
    try {
      setDefaultAttributes();
    } catch (error) {
      console.error("Error in attribute initialization:", error);
    }
  }, 100);
});
</script>

<template>
  <div v-if="requiredAttributes.length > 0">
    <div
      v-for="(attribute, index) in requiredAttributes"
      :key="attribute.name"
      class="flex flex-col gap-1 justify-between mb-4"
    >
      <div class="text-sm">
        {{ attribute.label }}
        <span v-if="activeVariations[index]" class="text-gray-400">
          {{ getSelectedName(attribute, activeVariations[index]) }}
        </span>
      </div>
      <select
        :id="formatAttributeName(attribute.name)"
        :name="attribute.name"
        required
        class="border-white shadow rounded p-2"
        @change="updateAttrs"
      >
        <option value="" disabled selected>
          {{ $t("messages.general.choose") }}
          {{ attribute.label ? decodeURIComponent(attribute.label) : "" }}
        </option>
        <option
          v-for="(term, termIndex) in attribute.terms?.nodes || []"
          :key="termIndex"
          :value="term.slug"
          v-html="term.name"
        />
      </select>
    </div>
  </div>
  <div v-else class="text-sm text-gray-500">
    {{
      $t("messages.shop.noVariationsRequired") ||
      "No variations required for this product"
    }}
  </div>
</template>

<style lang="postcss">
.radio-button {
  @apply border-transparent border-white rounded-lg cursor-pointer outline bg-gray-50 border-2 text-sm text-center outline-2 outline-gray-100 py-1.5 px-3 transition-all text-gray-800 inline-block hover:outline-gray-500;
}

.color-button {
  @apply border-transparent border-white cursor-pointer outline bg-gray-50 border-2 rounded-2xl text-sm text-center outline-2 outline-gray-100 transition-all text-gray-800 inline-block hover:outline-gray-500;
  width: 2rem;
  height: 2rem;
}

.color-green {
  @apply bg-green-500;
}

.color-blue {
  @apply bg-blue-500;
}

.color-red {
  @apply bg-red-500;
}

.color-yellow {
  @apply bg-yellow-500;
}

.color-orange {
  @apply bg-orange-500;
}

.color-purple {
  @apply bg-purple-500;
}

.color-black {
  @apply bg-black;
}

input[type="radio"]:checked ~ span {
  @apply outline outline-2 outline-gray-500;
}
</style>
