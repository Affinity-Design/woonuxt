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

/**
 * Fetches the cart; when WooGraphQL rejected the stored session token, forgets it and fetches ONCE more on the new
 * session WooGraphQL issues. A second rejection is thrown like any other failure, so a backend that rejects every
 * token can never cause a loop.
 */
export async function fetchCartWithSessionRecovery({fetchCart, isStaleSessionError, dropSession}) {
  try {
    return await fetchCart();
  } catch (error) {
    if (!isStaleSessionError(error)) throw error;
    dropSession();
    return fetchCart();
  }
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
