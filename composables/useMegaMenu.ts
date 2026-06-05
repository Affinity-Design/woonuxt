/**
 * Mega menu state machine.
 *
 * Shared between MainMenu (triggers) and MegaMenuPanel (the dropdown)
 * so the same active-index drives open/close transitions across
 * the whole header.
 *
 * Hover open uses a 150ms grace delay so a fast cursor passing over
 * the nav bar doesn't accidentally open panels. Close uses 200ms so
 * users can move diagonally from a top-level trigger to the panel
 * without it slamming shut.
 */
const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 200;

let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpenTimer() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

export function useMegaMenu() {
  const activeIndex = useState<number | null>('megaMenuActiveIndex', () => null);

  /** Whether any panel is currently open. */
  const isOpen = computed(() => activeIndex.value !== null);

  /**
   * Hover-open with a grace delay. If a panel is already open, switch
   * panels instantly so users can sweep across top-level items.
   */
  function scheduleOpen(index: number) {
    clearCloseTimer();
    if (activeIndex.value !== null) {
      activeIndex.value = index;
      clearOpenTimer();
      return;
    }
    clearOpenTimer();
    openTimer = setTimeout(() => {
      activeIndex.value = index;
      openTimer = null;
    }, OPEN_DELAY_MS);
  }

  /**
   * Keyboard / focus open — no delay, panel opens immediately.
   */
  function openImmediate(index: number) {
    clearOpenTimer();
    clearCloseTimer();
    activeIndex.value = index;
  }

  /**
   * Hover-close with a grace delay so users can move diagonally into
   * the panel without losing focus.
   */
  function scheduleClose() {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      activeIndex.value = null;
      closeTimer = null;
    }, CLOSE_DELAY_MS);
  }

  /** Cancel any pending close — e.g. when the cursor re-enters the panel. */
  function cancelClose() {
    clearCloseTimer();
  }

  /** Close immediately — used for Escape key + route navigation. */
  function closeNow() {
    clearOpenTimer();
    clearCloseTimer();
    activeIndex.value = null;
  }

  return {
    activeIndex,
    isOpen,
    scheduleOpen,
    openImmediate,
    scheduleClose,
    cancelClose,
    closeNow,
  };
}
