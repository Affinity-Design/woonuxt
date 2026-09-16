<script setup lang="ts">
// Admin-only my-account tab: conditional upsell rules ("cart has any Endless Frames → 20% off
// Endless wheels") for both storefronts. Thin UI over /api/admin/upsell-rules*, which verify the
// WP role server-side (server/utils/adminAuth.ts) and proxy the backend plugin.
import type {UpsellRuleDocument, UpsellSelectorInput} from '#shared/types/upsell';

const {listRules, setRuleStatus, deleteRule, loadTerms, termPath, loadHealth} = useUpsellAdmin();

const rules = ref<UpsellRuleDocument[]>([]);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const busyId = ref<number | null>(null);
const editing = ref<UpsellRuleDocument | null>(null);
const isEditorOpen = ref(false);
const health = ref<Record<string, any> | null>(null);

const load = async (): Promise<void> => {
  isLoading.value = true;
  loadError.value = null;
  try {
    rules.value = await listRules();
    await Promise.all([loadTerms('product_cat'), loadTerms('pa_manufacturer')]).catch(() => undefined);
  } catch (error: any) {
    loadError.value = describeUpsellError(error);
  } finally {
    isLoading.value = false;
  }
  loadHealth()
    .then((result) => {
      health.value = result;
    })
    .catch(() => {
      health.value = null;
    });
};
onMounted(load);

const openNew = (): void => {
  editing.value = null;
  isEditorOpen.value = true;
  actionError.value = null;
  notice.value = null;
};
const openEdit = (rule: UpsellRuleDocument): void => {
  editing.value = rule;
  isEditorOpen.value = true;
  actionError.value = null;
  notice.value = null;
};
const onSaved = async (rule: UpsellRuleDocument, warnings: string[]): Promise<void> => {
  isEditorOpen.value = false;
  editing.value = null;
  notice.value = warnings.includes('upsell_overlap')
    ? `Saved "${rule.name}". Heads-up: trigger and target overlap, so a product could discount itself.`
    : `Saved "${rule.name}".`;
  await load();
};

const toggleStatus = async (rule: UpsellRuleDocument): Promise<void> => {
  if (!rule.id) return;
  busyId.value = rule.id;
  actionError.value = null;
  try {
    const updated = await setRuleStatus(rule.id, rule.status === 'active' ? 'paused' : 'active');
    rules.value = rules.value.map((r) => (r.id === updated.id ? updated : r));
  } catch (error: any) {
    actionError.value = describeUpsellError(error);
  } finally {
    busyId.value = null;
  }
};

const remove = async (rule: UpsellRuleDocument): Promise<void> => {
  if (!rule.id) return;
  if (!window.confirm(`Delete "${rule.name}"? Shoppers with its coupon in their cart lose it on their next cart change.`)) return;
  busyId.value = rule.id;
  actionError.value = null;
  try {
    await deleteRule(rule.id);
    rules.value = rules.value.filter((r) => r.id !== rule.id);
  } catch (error: any) {
    actionError.value = describeUpsellError(error);
  } finally {
    busyId.value = null;
  }
};

const describeSelectors = (selectors: UpsellSelectorInput[]): string =>
  selectors
    .map((selector) => selector.term_ids.map((id) => termPath(selector.taxonomy, id)).join(', '))
    .filter(Boolean)
    .join(' + ');

const scheduleText = (rule: UpsellRuleDocument): string => {
  const {starts_at, ends_at} = rule.schedule || {};
  if (!starts_at && !ends_at) return 'Always';
  if (starts_at && ends_at) return `${starts_at} → ${ends_at}`;
  return starts_at ? `From ${starts_at}` : `Until ${ends_at}`;
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-gray-100 text-gray-600',
};
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 md:p-8">
    <UpsellRuleForm v-if="isEditorOpen" :initial="editing" @saved="onSaved" @cancel="isEditorOpen = false" />

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-semibold">Upsell Rules</h3>
          <p class="mt-1 max-w-xl text-sm text-gray-500">
            Conditional bundle discounts: when the cart holds a trigger item, matching target lines get a percent off through an auto-applied
            <code>UPSELL-XXXXXX</code> coupon. Rules run on proskatersplace.ca and proskatersplace.com from one place.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-60" :disabled="isLoading" @click="load">Refresh</button>
          <button type="button" class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark" @click="openNew">New rule</button>
        </div>
      </div>

      <div v-if="notice" class="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{{ notice }}</div>
      <div v-if="actionError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{{ actionError }}</div>

      <div v-if="isLoading" class="flex items-center justify-center gap-3 py-12 text-gray-500">
        <LoadingIcon size="20" />
        <span>Loading rules…</span>
      </div>

      <div v-else-if="loadError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{{ loadError }}</div>

      <div v-else-if="!rules.length" class="py-12 text-center text-gray-500">
        <Icon name="ion:pricetags-outline" size="32" class="mb-2 text-gray-300" />
        <p class="font-medium text-gray-600">No upsell rules yet.</p>
        <p class="mx-auto mt-1 max-w-md text-sm">Create one to start offering bundle discounts. New rules start paused so you can review them first.</p>
      </div>

      <div v-else class="mt-6 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th class="pb-2 pr-4">Rule</th>
              <th class="pb-2 pr-4">Discount</th>
              <th class="pb-2 pr-4">Stores</th>
              <th class="pb-2 pr-4">Schedule</th>
              <th class="pb-2 pr-4">Status</th>
              <th class="pb-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="rule in rules" :key="rule.id" class="align-top">
              <td class="py-3 pr-4">
                <div class="font-semibold text-gray-900">{{ rule.name }}</div>
                <div class="mt-0.5 text-xs text-gray-500">
                  <span class="font-medium text-gray-600">If cart has:</span> {{ describeSelectors(rule.trigger.selectors) || '—' }}
                  <span v-if="rule.trigger.min_qty > 1">(×{{ rule.trigger.min_qty }}+)</span>
                </div>
                <div class="text-xs text-gray-500">
                  <span class="font-medium text-gray-600">Discount:</span> {{ describeSelectors(rule.target.selectors) || '—' }}
                  <span v-if="rule.target.selectors.length > 1" class="text-gray-400">({{ rule.target.match === 'any' ? 'any' : 'all' }})</span>
                </div>
              </td>
              <td class="py-3 pr-4 font-semibold tabular-nums text-gray-900">{{ formatPercent(rule.discount.amount) }}</td>
              <td class="py-3 pr-4">
                <span v-for="channel in rule.channels" :key="channel" class="mr-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">.{{ channel }}</span>
              </td>
              <td class="py-3 pr-4 text-xs text-gray-600">{{ scheduleText(rule) }}</td>
              <td class="py-3 pr-4">
                <span :class="['inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_STYLES[rule.status] || STATUS_STYLES.paused]">{{ rule.status }}</span>
              </td>
              <td class="py-3 text-right whitespace-nowrap">
                <button type="button" class="mr-2 text-xs font-semibold text-primary underline disabled:opacity-50" :disabled="busyId === rule.id" @click="toggleStatus(rule)">
                  {{ rule.status === 'active' ? 'Pause' : 'Activate' }}
                </button>
                <button type="button" class="mr-2 text-xs font-semibold text-gray-700 underline disabled:opacity-50" :disabled="busyId === rule.id" @click="openEdit(rule)">Edit</button>
                <button type="button" class="text-xs font-semibold text-red-600 underline disabled:opacity-50" :disabled="busyId === rule.id" @click="remove(rule)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="health" class="mt-6 text-xs text-gray-400">
        Plugin v{{ health.plugin_version }} · WooCommerce {{ health.wc_version }} · GraphQL fields {{ health.graphql_registered ? 'registered' : 'not registered' }} ·
        {{ health.rule_counts?.active ?? 0 }} active / {{ health.rule_counts?.paused ?? 0 }} paused · coupons live {{ health.generated_coupons?.live ?? 0 }}, retired
        {{ health.generated_coupons?.retired ?? 0 }}<span v-if="health.last_cleanup?.at"> · last cleanup {{ health.last_cleanup.at }}</span>
      </p>
    </template>
  </div>
</template>
