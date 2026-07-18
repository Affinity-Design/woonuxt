<script setup lang="ts">
// Admin-only my-account tab: stranded Helcim charges (card charged, Woo order missing) with
// one-click reconciliation. Thin UI over /api/recover-helcim-order — that endpoint authorizes via
// the WP role check (server/utils/adminAuth.ts) and stays secret-gated for curl/ops use.
import {normalizeWooPriceText} from '~/utils/priceConverter';
interface RecoveredOrderRef {
  id?: number | string;
  databaseId?: number | string;
  orderNumber?: string | number;
  status?: string;
  total?: string;
}

interface StrandedChargeRow {
  transactionId: string;
  status: 'pending' | 'recovered' | 'failed';
  attempts: number;
  customerEmail?: string;
  customerName?: string;
  cartTotal?: string;
  failureReason?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  recoveredOrder?: RecoveredOrderRef;
}

const config = useRuntimeConfig();

const charges = ref<StrandedChargeRow[]>([]);
const pendingCount = ref(0);
const isLoading = ref(false);
const loadError = ref<string | null>(null);
const busyTransactions = ref<Record<string, boolean>>({});
const isRecoveringAll = ref(false);
const notice = ref<{type: 'success' | 'error'; text: string} | null>(null);

const wpOrderUrl = (order: RecoveredOrderRef): string => `${config.public.wpBaseUrl}/wp-admin/post.php?post=${order.databaseId || order.id}&action=edit`;

const formatWhen = (iso?: string): string => (iso ? new Date(iso).toLocaleString('en-CA', {dateStyle: 'medium', timeStyle: 'short'}) : '—');

const statusClasses: Record<StrandedChargeRow['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  recovered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const loadCharges = async (): Promise<void> => {
  isLoading.value = true;
  loadError.value = null;
  try {
    const res: any = await $fetch('/api/recover-helcim-order', {method: 'POST', body: {action: 'list'}});
    charges.value = res?.charges || [];
    pendingCount.value = res?.pendingCount || 0;
  } catch (error: any) {
    const statusCode = error?.status || error?.statusCode;
    loadError.value =
      statusCode === 401
        ? 'The server did not recognize your login as an admin, so it refused the list.'
        : error?.data?.statusMessage || error?.message || 'Failed to load recoverable orders.';
  } finally {
    isLoading.value = false;
  }
};

const describeFailure = (res: any): string => {
  if (res?.needsManualReview) return 'Could not verify against WooCommerce (is WordPress reachable?). Nothing was created.';
  if (res?.reason === 'no_recoverable_charge') return 'No stranded-charge record exists for this transaction.';
  return res?.error || res?.reason || 'Recovery did not produce an order.';
};

const recoverOne = async (transactionId: string): Promise<void> => {
  busyTransactions.value = {...busyTransactions.value, [transactionId]: true};
  notice.value = null;
  try {
    const res: any = await $fetch('/api/recover-helcim-order', {method: 'POST', body: {transactionId}});
    if (res?.recovered && res?.order) {
      const orderNumber = res.order.orderNumber || res.order.databaseId || res.order.id;
      const how = res.alreadyRecovered ? 'was already recovered as' : res.via === 'recreated' ? 'was recreated as' : 'matched existing';
      notice.value = {type: 'success', text: `Charge ${transactionId} ${how} order #${orderNumber}. No new charge was made.`};
    } else {
      notice.value = {type: 'error', text: `Charge ${transactionId}: ${describeFailure(res)}`};
    }
  } catch (error: any) {
    notice.value = {type: 'error', text: `Charge ${transactionId}: ${error?.data?.statusMessage || error?.message || 'request failed'}`};
  } finally {
    busyTransactions.value = {...busyTransactions.value, [transactionId]: false};
    await loadCharges();
  }
};

const recoverAll = async (): Promise<void> => {
  isRecoveringAll.value = true;
  notice.value = null;
  try {
    const res: any = await $fetch('/api/recover-helcim-order', {method: 'POST', body: {action: 'recover-all'}});
    const results: any[] = res?.results || [];
    const recovered = results.filter((r) => r?.recovered).length;
    const failed = results.length - recovered;
    notice.value = failed
      ? {type: 'error', text: `Recovered ${recovered} of ${results.length}; ${failed} still need attention (see rows below).`}
      : {type: 'success', text: recovered ? `Recovered all ${recovered} pending charge${recovered === 1 ? '' : 's'}.` : 'Nothing pending to recover.'};
  } catch (error: any) {
    notice.value = {type: 'error', text: error?.data?.statusMessage || error?.message || 'Recover-all request failed.'};
  } finally {
    isRecoveringAll.value = false;
    await loadCharges();
  }
};

onMounted(loadCharges);
</script>

<template>
  <div class="bg-white rounded-lg shadow p-6 md:p-8">
    <div class="flex flex-wrap items-start justify-between gap-4 mb-2">
      <div>
        <h3 class="text-xl font-semibold">Recoverable Orders</h3>
        <p class="text-sm text-gray-500 mt-1 max-w-xl">
          Helcim charges that were captured but never became a WooCommerce order. Recovery replays the saved order data —
          the customer is <strong>never</strong> charged again, and an existing order is adopted instead of duplicated.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-60"
          :disabled="isLoading || isRecoveringAll"
          @click="loadCharges">
          Refresh
        </button>
        <button
          v-if="pendingCount > 0"
          type="button"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          :disabled="isRecoveringAll || isLoading"
          @click="recoverAll">
          {{ isRecoveringAll ? 'Recovering…' : `Recover all pending (${pendingCount})` }}
        </button>
      </div>
    </div>

    <div
      v-if="notice"
      class="mt-4 rounded-lg border p-3 text-sm"
      :class="notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'">
      {{ notice.text }}
    </div>

    <div v-if="isLoading" class="flex items-center gap-3 py-12 justify-center text-gray-500">
      <LoadingIcon size="20" />
      <span>Loading recoverable orders…</span>
    </div>

    <div v-else-if="loadError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {{ loadError }}
    </div>

    <div v-else-if="!charges.length" class="py-12 text-center text-gray-500">
      <Icon name="ion:checkmark-circle-outline" size="32" class="text-green-500 mb-2" />
      <p>No stranded charges — every Helcim payment is reconciled.</p>
    </div>

    <div v-else class="mt-4 overflow-x-auto">
      <table class="w-full text-sm text-left">
        <thead>
          <tr class="border-b text-xs uppercase tracking-wide text-gray-400">
            <th class="py-2 pr-4">Created</th>
            <th class="py-2 pr-4">Customer</th>
            <th class="py-2 pr-4">Total</th>
            <th class="py-2 pr-4">Status</th>
            <th class="py-2 pr-4">Failure</th>
            <th class="py-2 pr-4">Order</th>
            <th class="py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="charge in charges" :key="charge.transactionId" class="border-b last:border-0 align-top">
            <td class="py-3 pr-4 whitespace-nowrap text-gray-600">{{ formatWhen(charge.createdAt) }}</td>
            <td class="py-3 pr-4">
              <div class="font-medium text-gray-800">{{ charge.customerName || '—' }}</div>
              <div class="text-gray-500">{{ charge.customerEmail || '—' }}</div>
              <div class="font-mono text-xs text-gray-400 mt-0.5" :title="'Helcim transaction ID'">txn {{ charge.transactionId }}</div>
            </td>
            <!-- Older stranded-charge records persisted the raw Woo string ("$2.25&nbsp;CAD");
                 normalize on display so entities never render literally. -->
            <td class="py-3 pr-4 whitespace-nowrap text-gray-800">{{ normalizeWooPriceText(charge.cartTotal) || '—' }}</td>
            <td class="py-3 pr-4">
              <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="statusClasses[charge.status]">
                {{ charge.status }}
              </span>
              <div v-if="charge.attempts" class="text-xs text-gray-400 mt-1">{{ charge.attempts }} attempt{{ charge.attempts === 1 ? '' : 's' }}</div>
            </td>
            <td class="py-3 pr-4 max-w-[260px]">
              <div class="truncate text-gray-600" :title="charge.failureReason">{{ charge.failureReason || '—' }}</div>
              <div v-if="charge.lastError && charge.lastError !== charge.failureReason" class="truncate text-xs text-gray-400 mt-0.5" :title="charge.lastError">
                {{ charge.lastError }}
              </div>
            </td>
            <td class="py-3 pr-4 whitespace-nowrap">
              <a
                v-if="charge.recoveredOrder"
                :href="wpOrderUrl(charge.recoveredOrder)"
                target="_blank"
                rel="noopener"
                class="text-primary underline font-medium">
                #{{ charge.recoveredOrder.orderNumber || charge.recoveredOrder.databaseId }}
              </a>
              <span v-else class="text-gray-400">—</span>
            </td>
            <td class="py-3 whitespace-nowrap text-right">
              <button
                v-if="charge.status !== 'recovered'"
                type="button"
                class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
                :disabled="busyTransactions[charge.transactionId] || isRecoveringAll"
                @click="recoverOne(charge.transactionId)">
                {{ busyTransactions[charge.transactionId] ? 'Recovering…' : 'Recover' }}
              </button>
              <Icon v-else name="ion:checkmark-circle" size="20" class="text-green-500" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
