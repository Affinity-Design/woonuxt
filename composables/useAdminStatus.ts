// composables/useAdminStatus.ts
//
// WP-admin status for the logged-in customer, verified SERVER-side via /api/admin/me (the
// woocommerce-session cookie travels with the request; WordPress resolves identity + roles).
// This state only decides which UI to offer — every admin endpoint re-verifies on the server.
interface AdminStatus {
  checked: boolean;
  loading: boolean;
  isAdmin: boolean;
  username: string | null;
  roles: string[];
}

export function useAdminStatus() {
  const status = useState<AdminStatus>('wp-admin-status', () => ({
    checked: false,
    loading: false,
    isAdmin: false,
    username: null,
    roles: [],
  }));

  const refresh = async (): Promise<void> => {
    if (status.value.loading) return;
    status.value = {...status.value, loading: true};
    try {
      const res = await $fetch<{isAdmin: boolean; username: string | null; roles: string[]}>('/api/admin/me');
      status.value = {checked: true, loading: false, isAdmin: !!res?.isAdmin, username: res?.username || null, roles: res?.roles || []};
    } catch {
      status.value = {checked: true, loading: false, isAdmin: false, username: null, roles: []};
    }
  };

  // Cheap to call from any page — only the first call hits the network.
  const checkOnce = async (): Promise<void> => {
    if (!status.value.checked && !status.value.loading) await refresh();
  };

  const isAdmin = computed(() => status.value.isAdmin);

  return {adminStatus: status, isAdmin, checkOnce, refresh};
}
