<script setup lang="ts">
// Rule editor for the Upsell Rules admin tab. Mirrors the plugin's validation so most
// mistakes are caught before the round-trip; the backend remains the authority.
import type {UpsellRuleDocument, UpsellSelectorInput, UpsellTaxonomy} from '#shared/types/upsell';

const props = defineProps<{initial: UpsellRuleDocument | null}>();
const emit = defineEmits<{(e: 'saved', rule: UpsellRuleDocument, warnings: string[]): void; (e: 'cancel'): void}>();

const {saveRule} = useUpsellAdmin();

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const form = reactive<UpsellRuleDocument>(clone(props.initial ? {...createDefaultUpsellRule(), ...props.initial} : createDefaultUpsellRule()));

const isSaving = ref(false);
const errors = ref<string[]>([]);
const warnings = ref<string[]>([]);
const showFrench = ref(Object.values(form.notices.fr || {}).some(Boolean));
const showAdvanced = ref(Boolean(form.cta.ca_path || form.cta.com_path || form.coupon.ttl_hours !== 48 || form.coupon.code_prefix !== 'UPSELL'));

const newSelector = (): UpsellSelectorInput => ({taxonomy: 'product_cat', term_ids: [], include_children: true});
const addSelector = (side: 'trigger' | 'target'): void => {
  form[side].selectors.push(newSelector());
};
const removeSelector = (side: 'trigger' | 'target', index: number): void => {
  if (form[side].selectors.length > 1) form[side].selectors.splice(index, 1);
};
const onTaxonomyChange = (selector: UpsellSelectorInput, taxonomy: UpsellTaxonomy): void => {
  selector.taxonomy = taxonomy;
  selector.term_ids = [];
  selector.include_children = taxonomy === 'product_cat';
};

const toggleChannel = (channel: 'ca' | 'com'): void => {
  form.channels = form.channels.includes(channel) ? form.channels.filter((c) => c !== channel) : [...form.channels, channel];
};

const discountDisplay = computed(() => formatPercent(form.discount.amount));
const preview = (template: string): string =>
  String(template || '')
    .replace(/\{discount\}/g, discountDisplay.value || '{discount}')
    .replace(/\{trigger\}/g, form.trigger.trigger_label || '{trigger}')
    .replace(/\{target\}/g, form.target.target_label || '{target}');

const hasOverlap = computed(() => {
  if (form.target.exclude_trigger_items) return false;
  return form.trigger.selectors.some((a) => form.target.selectors.some((b) => a.taxonomy === b.taxonomy && a.term_ids.some((id) => b.term_ids.includes(id))));
});

const validate = (): string[] => {
  const problems: string[] = [];
  if (!form.name.trim()) problems.push('Give the rule a name.');
  if (!form.channels.length) problems.push('Choose at least one store.');
  const filled = (selectors: UpsellSelectorInput[]) => selectors.filter((s) => s.term_ids.length);
  if (!filled(form.trigger.selectors).length) problems.push('Pick at least one trigger category or brand.');
  if (!filled(form.target.selectors).length) problems.push('Pick at least one target category or brand.');
  const amount = Number(form.discount.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100) problems.push('Discount must be between 1% and 100%.');
  if (form.schedule.starts_at && form.schedule.ends_at && form.schedule.starts_at > form.schedule.ends_at) problems.push('The start date must be on or before the end date.');
  for (const key of ['ca_path', 'com_path'] as const) {
    const value = form.cta[key];
    if (value && !value.startsWith('/')) problems.push('Link overrides must start with "/".');
  }
  return problems;
};

const submit = async (): Promise<void> => {
  errors.value = validate();
  if (errors.value.length) return;
  isSaving.value = true;
  try {
    const payload = clone(form);
    payload.trigger.selectors = payload.trigger.selectors.filter((s) => s.term_ids.length);
    payload.target.selectors = payload.target.selectors.filter((s) => s.term_ids.length);
    payload.schedule.starts_at = payload.schedule.starts_at || null;
    payload.schedule.ends_at = payload.schedule.ends_at || null;
    payload.cta.ca_path = payload.cta.ca_path?.trim() || null;
    payload.cta.com_path = payload.cta.com_path?.trim() || null;
    payload.target.max_qty_per_order = payload.target.max_qty_per_order ? Number(payload.target.max_qty_per_order) : null;
    const result = await saveRule(payload);
    warnings.value = result.warnings || [];
    emit('saved', result.rule, warnings.value);
  } catch (error: any) {
    errors.value = [describeUpsellError(error)];
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <form class="flex flex-col gap-8" @submit.prevent="submit">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 class="text-xl font-semibold">{{ form.id ? 'Edit rule' : 'New rule' }}</h3>
        <p class="mt-1 max-w-xl text-sm text-gray-500">
          When the cart contains any <strong>trigger</strong> item, every <strong>target</strong> line gets the discount. Trigger items themselves are never discounted.
        </p>
      </div>
      <button type="button" class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200" @click="emit('cancel')">Back to list</button>
    </div>

    <div v-if="errors.length" class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <ul class="list-disc pl-5">
        <li v-for="message in errors" :key="message">{{ message }}</li>
      </ul>
    </div>

    <!-- Basics -->
    <section class="grid gap-4 md:grid-cols-2">
      <label class="block md:col-span-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Rule name</span>
        <input v-model="form.name" type="text" required class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Endless frames → 20% off Endless wheels" />
      </label>
      <div>
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Stores</span>
        <div class="mt-2 flex gap-4 text-sm">
          <label class="inline-flex items-center gap-2"><input type="checkbox" :checked="form.channels.includes('ca')" @change="toggleChannel('ca')" /> proskatersplace.ca</label>
          <label class="inline-flex items-center gap-2"><input type="checkbox" :checked="form.channels.includes('com')" @change="toggleChannel('com')" /> proskatersplace.com</label>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</span>
          <select v-model="form.status" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="paused">Paused</option>
            <option value="active">Active</option>
          </select>
        </label>
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</span>
          <input v-model.number="form.priority" type="number" min="0" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <span class="text-xs text-gray-400">Lower runs first when rules compete for a line.</span>
        </label>
      </div>
    </section>

    <!-- Trigger / Target -->
    <div class="grid gap-6 lg:grid-cols-2">
      <section v-for="side in (['trigger', 'target'] as const)" :key="side" class="rounded-lg border border-gray-100 bg-gray-50 p-4">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold">{{ side === 'trigger' ? 'Trigger — cart contains any of…' : 'Target — discount applies to…' }}</h4>
          <button type="button" class="text-xs font-semibold text-primary underline" @click="addSelector(side)">+ Add selector</button>
        </div>
        <div v-for="(selector, index) in form[side].selectors" :key="`${side}-${index}`" class="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <div class="flex items-center gap-2">
            <select :value="selector.taxonomy" class="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" @change="onTaxonomyChange(selector, ($event.target as HTMLSelectElement).value as UpsellTaxonomy)">
              <option v-for="tax in UPSELL_TAXONOMIES" :key="tax.value" :value="tax.value">{{ tax.label }}</option>
            </select>
            <label v-if="selector.taxonomy === 'product_cat'" class="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <input v-model="selector.include_children" type="checkbox" /> include subcategories
            </label>
            <button v-if="form[side].selectors.length > 1" type="button" class="ml-auto text-xs text-gray-400 hover:text-red-600" @click="removeSelector(side, index)">Remove</button>
          </div>
          <div class="mt-2">
            <UpsellTermPicker v-model="selector.term_ids" :taxonomy="selector.taxonomy" />
          </div>
        </div>
        <p v-if="side === 'target' && form.target.selectors.length > 1" class="mt-3 text-xs text-gray-600">
          A target product must match
          <select v-model="form.target.match" class="rounded border border-gray-200 px-1 py-0.5 text-xs">
            <option value="all">all selectors (e.g. brand AND category)</option>
            <option value="any">any selector</option>
          </select>
        </p>
        <p v-else-if="side === 'trigger' && form.trigger.selectors.length > 1" class="mt-3 text-xs text-gray-600">A product matching any trigger selector unlocks the discount.</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ side === 'trigger' ? 'Trigger label' : 'Target label' }}</span>
            <input
              v-model="form[side][side === 'trigger' ? 'trigger_label' : 'target_label']"
              type="text"
              class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              :placeholder="side === 'trigger' ? 'Endless Frames' : 'Endless wheels'" />
            <span class="text-xs text-gray-400">Used for {{ side === 'trigger' ? '{trigger}' : '{target}' }} in notices. Defaults to the first term's name.</span>
          </label>
          <label v-if="side === 'trigger'" class="block">
            <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Minimum trigger quantity</span>
            <input v-model.number="form.trigger.min_qty" type="number" min="1" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label v-else class="block">
            <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Max discounted items per order</span>
            <input v-model="form.target.max_qty_per_order" type="number" min="1" placeholder="unlimited" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <div v-if="side === 'target'" class="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
          <label class="inline-flex items-center gap-1.5"><input v-model="form.target.exclude_trigger_items" type="checkbox" /> never discount trigger items</label>
          <label class="inline-flex items-center gap-1.5"><input v-model="form.target.exclude_sale_items" type="checkbox" /> exclude sale items</label>
        </div>
        <p v-if="side === 'target' && hasOverlap" class="mt-2 rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
          Trigger and target overlap and trigger items may be discounted — a product could discount itself.
        </p>
      </section>
    </div>

    <!-- Discount + schedule -->
    <section class="grid gap-4 md:grid-cols-3">
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Discount (% off target lines)</span>
        <div class="mt-1 flex items-center gap-2">
          <input v-model.number="form.discount.amount" type="number" min="1" max="100" step="0.5" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <span class="text-sm font-semibold text-gray-600">%</span>
        </div>
      </label>
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Starts (Toronto)</span>
        <input v-model="form.schedule.starts_at" type="date" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </label>
      <label class="block">
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Ends (Toronto, inclusive)</span>
        <input v-model="form.schedule.ends_at" type="date" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </label>
    </section>

    <!-- Notices -->
    <section>
      <div class="flex items-center justify-between">
        <h4 class="font-semibold">Shopper messages</h4>
        <label class="inline-flex items-center gap-1.5 text-xs text-gray-600"><input v-model="showFrench" type="checkbox" /> add French (fr-CA)</label>
      </div>
      <p class="mt-1 text-xs text-gray-500">Placeholders: <code>{discount}</code> → {{ discountDisplay || '20%' }}, <code>{trigger}</code>, <code>{target}</code>.</p>
      <div class="mt-3 grid gap-3">
        <div v-for="field in UPSELL_NOTICE_FIELDS" :key="field.key" class="rounded-lg border border-gray-100 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ field.label }}</div>
          <div class="text-xs text-gray-400">{{ field.hint }}</div>
          <input v-model="form.notices.en[field.key]" type="text" class="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <input v-if="showFrench" v-model="form.notices.fr[field.key]" type="text" placeholder="Français (optionnel)" class="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <div class="mt-1 text-xs text-gray-500">Preview: <em>{{ preview(form.notices.en[field.key]) }}</em></div>
        </div>
      </div>
    </section>

    <!-- Advanced -->
    <section>
      <button type="button" class="text-sm font-semibold text-primary underline" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? 'Hide' : 'Show' }} advanced options</button>
      <div v-if="showAdvanced" class="mt-3 grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">"Shop target" link override — .ca</span>
          <input v-model="form.cta.ca_path" type="text" placeholder="/product-category/wheels?filter=pa_manufacturer[endless]" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">"Shop target" link override — .com</span>
          <input v-model="form.cta.com_path" type="text" placeholder="/product-category/wheels/?filter_manufacturer=endless" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Generated coupon lifetime (hours)</span>
          <input v-model.number="form.coupon.ttl_hours" type="number" min="1" max="720" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Coupon code prefix</span>
          <input v-model="form.coupon.code_prefix" type="text" maxlength="12" class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase" />
        </label>
      </div>
    </section>

    <div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-6">
      <button type="submit" :disabled="isSaving" class="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
        {{ isSaving ? 'Saving…' : form.id ? 'Save changes' : 'Create rule' }}
      </button>
      <button type="button" class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200" :disabled="isSaving" @click="emit('cancel')">Cancel</button>
      <span class="text-xs text-gray-400">Changes reach proskatersplace.com immediately and proskatersplace.ca within 5 minutes.</span>
    </div>
  </form>
</template>
