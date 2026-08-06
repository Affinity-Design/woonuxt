export function createCartRefreshCoordinator() {
  let activeRefresh = null;
  let didCompleteRefresh = false;

  return {
    hasCompletedRefresh() {
      return didCompleteRefresh;
    },

    hasActiveRefresh() {
      return activeRefresh !== null;
    },

    runRefresh(refreshOperation) {
      if (activeRefresh) return activeRefresh;

      activeRefresh = Promise.resolve()
        .then(refreshOperation)
        .finally(() => {
          didCompleteRefresh = true;
          activeRefresh = null;
        });

      return activeRefresh;
    },

    async waitForActiveRefresh() {
      if (activeRefresh) await activeRefresh;
    },
  };
}

export async function prepareCartSessionForMutation({refreshCoordinator, refreshCart}) {
  if (refreshCoordinator.hasCompletedRefresh()) {
    await refreshCoordinator.waitForActiveRefresh();
    return;
  }

  await refreshCart();
}

export async function finalizeSuccessfulCartMutation({
  refreshCoordinator,
  successfulCart,
  sessionToken,
  installSessionToken,
  updateCart,
  markMutationFinalizationPending,
  afterMutationApplied,
  refreshCart,
}) {
  // A refresh may have started while the add request was in flight using the
  // previous session. Let it finish before installing the mutation session so
  // the follow-up refresh cannot accidentally join that stale request.
  await refreshCoordinator.waitForActiveRefresh();
  if (markMutationFinalizationPending) markMutationFinalizationPending();

  if (sessionToken) installSessionToken(sessionToken);
  if (successfulCart) updateCart(successfulCart);
  if (afterMutationApplied) afterMutationApplied();

  const refreshSucceeded = await refreshCart({preserveStateOnError: true});

  if (!refreshSucceeded && successfulCart) updateCart(successfulCart);

  return refreshSucceeded;
}
