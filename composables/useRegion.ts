import {computed, onMounted} from 'vue';

interface RegionApiResponse {
  countryCode?: string;
}

interface RegionState {
  countryCode: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const CANADA_STORE_URL = 'https://proskatersplace.ca';
const INTERNATIONAL_STORE_URL = 'https://proskatersplace.com';
const DEFAULT_GRAPHQL_ENDPOINT = 'https://proskatersplace.com/graphql';

export const useRegion = () => {
  const runtimeConfig = useRuntimeConfig();
  const state = useState<RegionState>('calculator-region', () => ({
    countryCode: 'CA',
    loaded: false,
    loading: false,
    error: null,
  }));

  const refresh = async () => {
    if (state.value.loading || state.value.loaded) return;

    state.value.loading = true;
    state.value.error = null;

    try {
      const response = await $fetch<RegionApiResponse>('/api/region.json');
      state.value.countryCode = (response.countryCode || 'CA').toUpperCase();
      state.value.loaded = true;
    } catch (error) {
      state.value.countryCode = 'CA';
      state.value.error = error instanceof Error ? error.message : 'Could not detect region.';
      state.value.loaded = true;
    } finally {
      state.value.loading = false;
    }
  };

  if (process.client) {
    onMounted(() => {
      refresh();
    });
  }

  const countryCode = computed(() => state.value.countryCode);
  const isCanadian = computed(() => countryCode.value === 'CA');
  const storeBaseUrl = computed(() => (isCanadian.value ? CANADA_STORE_URL : INTERNATIONAL_STORE_URL));
  const graphqlEndpoint = computed(() => String(runtimeConfig.public.calculatorGraphqlEndpoint || DEFAULT_GRAPHQL_ENDPOINT));

  return {
    countryCode,
    isCanadian,
    storeBaseUrl,
    graphqlEndpoint,
    loading: computed(() => state.value.loading || !state.value.loaded),
    loaded: computed(() => state.value.loaded),
    error: computed(() => state.value.error),
    refresh,
  };
};
