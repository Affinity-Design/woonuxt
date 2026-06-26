/**
 * Promo scheduling helper for time-limited banners and carousel slides.
 *
 * A promo is "active" when:
 *   - it is not explicitly disabled (`enabled !== false`), AND
 *   - today (America/Toronto) is on or before its `endDate` (inclusive).
 *
 * `endDate` is a plain `YYYY-MM-DD` string and is treated as a Toronto-local
 * calendar day. A sale that "Ends July 5" therefore stays visible through all of
 * July 5 Eastern and disappears on July 6 — regardless of the visitor's timezone
 * or the Cloudflare edge server's UTC clock.
 *
 * The check is reactive on the client (re-evaluated on mount), so statically
 * prerendered / KV-cached pages still retire an expired promo without a rebuild.
 */
export interface PromoScheduleConfig {
  enabled?: boolean;
  /** Last day to show the promo, inclusive. Format: YYYY-MM-DD (America/Toronto). */
  endDate?: string | null;
}

/** Today's date in America/Toronto as a sortable YYYY-MM-DD string (en-CA formats this way). */
function getTorontoDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function usePromoSchedule() {
  const mounted = ref(false);
  const todayToronto = ref(getTorontoDateString());

  // Date gating is applied on the client only. During SSR / static prerender the
  // server's clock (and the build date baked into cached HTML) can differ from the
  // visitor's actual date, which would cause a hydration mismatch. So both the
  // server render and the first client render fall back to the deterministic
  // `enabled` flag, then `onMounted` switches on the date check and the banner/slide
  // hides reactively if the promo has expired.
  onMounted(() => {
    todayToronto.value = getTorontoDateString();
    mounted.value = true;
  });

  const isActive = (promo: PromoScheduleConfig | null | undefined): boolean => {
    if (!promo || promo.enabled === false) return false;
    if (!promo.endDate) return true;
    if (!mounted.value) return true; // defer date gating to the client to avoid hydration mismatch
    // Lexicographic comparison is valid because both are YYYY-MM-DD.
    return todayToronto.value <= promo.endDate;
  };

  return {todayToronto, mounted, isActive};
}
