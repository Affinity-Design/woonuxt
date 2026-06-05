/**
 * Mobile multi-level navigation state.
 *
 * Drives `MobileNavDrawer.vue` and `MobileBottomBar.vue`.
 *
 *  level 0 (root)      → list of top-level categories + aux links
 *  level 1 (category)  → selected category's image banner + group list
 *  level 2 (group)     → selected group's subcategory link list
 *
 * `direction` tracks whether the user is drilling deeper ('forward') or
 * stepping back ('back') so the drawer can pick the right slide-in CSS.
 *
 * The drawer's open/closed state is intentionally piggybacked onto the
 * existing `isShowingMobileMenu` flag in `useHelpers()` — that way the
 * base layer's scrim, body-overflow-hidden watcher, and route-change
 * close logic all keep working without modification.
 */
export type MobileNavLevel = 0 | 1 | 2;
export type MobileNavDirection = 'forward' | 'back';

export function useMobileNav() {
  const { isShowingMobileMenu, toggleMobileMenu } = useHelpers();

  const level = useState<MobileNavLevel>('mobileNavLevel', () => 0);
  const direction = useState<MobileNavDirection>('mobileNavDirection', () => 'forward');
  const categoryIndex = useState<number | null>('mobileNavCategoryIndex', () => null);
  const groupIndex = useState<number | null>('mobileNavGroupIndex', () => null);

  /** Open the drawer at root. */
  function open() {
    level.value = 0;
    direction.value = 'forward';
    categoryIndex.value = null;
    groupIndex.value = null;
    toggleMobileMenu(true);
  }

  /** Close the drawer and reset state on next tick (after exit animation). */
  function close() {
    toggleMobileMenu(false);
    // Wait for the drawer slide-out before resetting state so the user
    // doesn't see a flash of the root panel as it leaves.
    setTimeout(() => {
      level.value = 0;
      categoryIndex.value = null;
      groupIndex.value = null;
    }, 300);
  }

  /** Drill into a top-level category panel. */
  function goCategory(index: number) {
    categoryIndex.value = index;
    groupIndex.value = null;
    direction.value = 'forward';
    level.value = 1;
  }

  /** Drill into a group within the current category. */
  function goGroup(index: number) {
    groupIndex.value = index;
    direction.value = 'forward';
    level.value = 2;
  }

  /** Step back one level (or close drawer if at root). */
  function back() {
    direction.value = 'back';
    if (level.value === 2) {
      level.value = 1;
      groupIndex.value = null;
    } else if (level.value === 1) {
      level.value = 0;
      categoryIndex.value = null;
    } else {
      close();
    }
  }

  return {
    isOpen: isShowingMobileMenu,
    level,
    direction,
    categoryIndex,
    groupIndex,
    open,
    close,
    goCategory,
    goGroup,
    back,
  };
}
