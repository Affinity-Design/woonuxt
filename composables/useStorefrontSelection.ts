export type StorefrontChoice = 'canada' | 'usa' | 'international';

interface StorefrontOption {
  value: StorefrontChoice;
  label: string;
  flag: string;
  description: string;
}

interface StorefrontSelectionState {
  choice: StorefrontChoice | null;
}

const CANADA_HOST = 'https://proskatersplace.ca';
const COM_HOST = 'https://proskatersplace.com';
const DEFAULT_GRAPHQL_ENDPOINT = 'https://proskatersplace.com/graphql';
const STORAGE_KEY = 'calculator-storefront';

export const storefrontOptions: StorefrontOption[] = [
  {value: 'canada', label: 'Canada', flag: '🇨🇦', description: 'Product links open on proskatersplace.ca in CAD'},
  {value: 'usa', label: 'USA', flag: '🇺🇸', description: 'Product links open on proskatersplace.com in USD'},
  {value: 'international', label: 'International', flag: '🌐', description: 'Product links open on proskatersplace.com in USD'},
];

export const useStorefrontSelection = () => {
  const runtimeConfig = useRuntimeConfig();

  const state = useState<StorefrontSelectionState>('calculator-storefront', () => ({choice: null}));

  // Restore from localStorage after hydration to avoid SSR mismatch.
  // Server always renders choice=null (Step 0). After mount the stored value kicks in as a reactive update.
  onMounted(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as StorefrontChoice | null;
    if (stored === 'canada' || stored === 'usa' || stored === 'international') {
      state.value.choice = stored;
    }
  });

  const setChoice = (choice: StorefrontChoice) => {
    state.value.choice = choice;
    if (process.client) {
      globalThis.localStorage?.setItem(STORAGE_KEY, choice);
      // Analytics
      const w = window as typeof window & {dataLayer?: Array<Record<string, unknown>>; gtag?: (t: string, n: string, p: Record<string, unknown>) => void};
      w.dataLayer?.push({event: 'calc_storefront_selected', storefrontChoice: choice});
      w.gtag?.('event', 'calc_storefront_selected', {storefrontChoice: choice});
    }
  };

  const storeBaseUrl = computed(() => {
    return state.value.choice === 'canada' ? CANADA_HOST : COM_HOST;
  });

  const usesCanadianPermalinks = computed(() => state.value.choice === 'canada');

  const graphqlEndpoint = computed(() =>
    String(runtimeConfig.public.calculatorGraphqlEndpoint || DEFAULT_GRAPHQL_ENDPOINT),
  );

  const hasChosen = computed(() => state.value.choice !== null);

  const resetChoice = () => {
    state.value.choice = null;
    if (process.client) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  };

  return {
    choice: computed(() => state.value.choice),
    hasChosen,
    storeBaseUrl,
    usesCanadianPermalinks,
    graphqlEndpoint,
    storefrontOptions,
    setChoice,
    resetChoice,
  };
};
