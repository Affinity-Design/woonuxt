import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCartRefreshCoordinator,
  fetchCartWithSessionRecovery,
  finalizeSuccessfulCartMutation,
  prepareCartSessionForMutation,
} from '../utils/cartRefreshCoordinator.mjs';
import {normalizeWooCommerceSessionToken, sendWithWooSessionRecovery} from '../server/utils/woocommerceSession.mjs';
import {isWooSessionTokenError} from '../shared/utils/wooSession.mjs';

const rejectedSession = (reason = 'Signature verification failed') => ({gqlErrors: [{message: `invalid_token: ${reason}`}]});

test('normalizes the WooCommerce session response header', () => {
  assert.equal(normalizeWooCommerceSessionToken('Session customer-session-token'), 'customer-session-token');
  assert.equal(normalizeWooCommerceSessionToken('customer-session-token'), 'customer-session-token');
  assert.equal(normalizeWooCommerceSessionToken('  Session customer-session-token  '), 'customer-session-token');
  assert.equal(normalizeWooCommerceSessionToken(null), null);
  assert.equal(normalizeWooCommerceSessionToken(''), null);
});

test('shares an active cart refresh and lets mutations wait for it', async () => {
  const coordinator = createCartRefreshCoordinator();
  let finishRefresh;
  let secondRefreshCalls = 0;
  let mutationStarted = false;

  const firstRefresh = coordinator.runRefresh(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const secondRefresh = coordinator.runRefresh(async () => {
    secondRefreshCalls += 1;
    return true;
  });
  const waitingMutation = coordinator.waitForActiveRefresh().then(() => {
    mutationStarted = true;
  });

  assert.equal(firstRefresh, secondRefresh);
  assert.equal(coordinator.hasActiveRefresh(), true);
  assert.equal(coordinator.hasCompletedRefresh(), false);
  assert.equal(mutationStarted, false);

  await Promise.resolve();
  finishRefresh(true);
  await waitingMutation;

  assert.equal(secondRefreshCalls, 0);
  assert.equal(mutationStarted, true);
  assert.equal(coordinator.hasActiveRefresh(), false);
  assert.equal(coordinator.hasCompletedRefresh(), true);
});

test('establishes a cart session before a click-only first mutation', async () => {
  const coordinator = createCartRefreshCoordinator();
  let refreshCalls = 0;

  await prepareCartSessionForMutation({
    refreshCoordinator: coordinator,
    refreshCart: () =>
      coordinator.runRefresh(async () => {
        refreshCalls += 1;
        return true;
      }),
  });

  assert.equal(refreshCalls, 1);
  assert.equal(coordinator.hasCompletedRefresh(), true);
});

test('installs the mutation session before refreshing and preserves its cart when refresh fails', async () => {
  const coordinator = createCartRefreshCoordinator();
  const successfulCart = {contents: {itemCount: 1}};
  const events = [];

  const refreshSucceeded = await finalizeSuccessfulCartMutation({
    refreshCoordinator: coordinator,
    successfulCart,
    sessionToken: 'new-session-token',
    installSessionToken: (sessionToken) => events.push(['session', sessionToken]),
    updateCart: (cart) => events.push(['cart', cart]),
    afterMutationApplied: () => events.push(['mutation-applied']),
    refreshCart: async (options) => {
      events.push(['refresh', options]);
      return false;
    },
  });

  assert.equal(refreshSucceeded, false);
  assert.deepEqual(events, [
    ['session', 'new-session-token'],
    ['cart', successfulCart],
    ['mutation-applied'],
    ['refresh', {preserveStateOnError: true}],
    ['cart', successfulCart],
  ]);
});

test('keeps refreshed cart state when the follow-up refresh succeeds', async () => {
  const coordinator = createCartRefreshCoordinator();
  const successfulCart = {contents: {itemCount: 1}};
  const appliedCarts = [];

  const refreshSucceeded = await finalizeSuccessfulCartMutation({
    refreshCoordinator: coordinator,
    successfulCart,
    sessionToken: null,
    installSessionToken: () => assert.fail('No empty session token should be installed'),
    updateCart: (cart) => appliedCarts.push(cart),
    refreshCart: async () => true,
  });

  assert.equal(refreshSucceeded, true);
  assert.deepEqual(appliedCarts, [successfulCart]);
});

test('waits for a stale refresh started during the add request before installing the mutation session', async () => {
  const coordinator = createCartRefreshCoordinator();
  const successfulCart = {contents: {itemCount: 1}};
  const events = [];
  let finishStaleRefresh;

  const staleRefresh = coordinator.runRefresh(
    () =>
      new Promise((resolve) => {
        finishStaleRefresh = resolve;
      }),
  );
  await Promise.resolve();

  const mutationFinalization = finalizeSuccessfulCartMutation({
    refreshCoordinator: coordinator,
    successfulCart,
    sessionToken: 'new-session-token',
    installSessionToken: (sessionToken) => events.push(['session', sessionToken]),
    updateCart: (cart) => events.push(['cart', cart]),
    markMutationFinalizationPending: () => events.push(['loading']),
    refreshCart: async () => {
      events.push(['refresh']);
      return true;
    },
  });

  await Promise.resolve();
  assert.deepEqual(events, []);

  finishStaleRefresh(true);
  await staleRefresh;
  await mutationFinalization;

  assert.deepEqual(events, [['loading'], ['session', 'new-session-token'], ['cart', successfulCart], ['refresh']]);
});

test('a cart refresh rejected for a stale session drops it and fetches once more on the new session', async () => {
  let fetchCalls = 0;
  let dropCalls = 0;
  const payload = {cart: {isEmpty: true}, customer: {sessionToken: 'fresh-session-token'}};

  const result = await fetchCartWithSessionRecovery({
    fetchCart: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw rejectedSession();
      return payload;
    },
    isStaleSessionError: isWooSessionTokenError,
    dropSession: () => {
      dropCalls += 1;
    },
  });

  assert.equal(result, payload);
  assert.equal(fetchCalls, 2);
  assert.equal(dropCalls, 1);
});

test('a backend that rejects every session token cannot loop the cart refresh', async () => {
  let fetchCalls = 0;

  await assert.rejects(
    fetchCartWithSessionRecovery({
      fetchCart: async () => {
        fetchCalls += 1;
        throw rejectedSession('Provided key is too short');
      },
      isStaleSessionError: isWooSessionTokenError,
      dropSession: () => {},
    }),
  );
  assert.equal(fetchCalls, 2);
});

test('other cart refresh failures are rethrown without touching the session', async () => {
  let fetchCalls = 0;
  const timeout = new Error('Cart refresh timed out');

  await assert.rejects(
    fetchCartWithSessionRecovery({
      fetchCart: async () => {
        fetchCalls += 1;
        throw timeout;
      },
      isStaleSessionError: isWooSessionTokenError,
      dropSession: () => assert.fail('A non-session failure must not drop the session'),
    }),
    timeout,
  );
  assert.equal(fetchCalls, 1);
});

test('add-to-cart repeats once on the session WooGraphQL issued when the stored token was rejected', async () => {
  const sent = [];
  const result = await sendWithWooSessionRecovery({
    sessionToken: 'stale',
    send: async (token) => {
      sent.push(token);
      return token === 'stale'
        ? {body: {errors: [{message: 'invalid_token: Signature verification failed'}]}, issuedToken: 'fresh'}
        : {body: {data: {addToCart: {cart: {isEmpty: false}}}}, issuedToken: 'fresh'};
    },
    isStaleSessionError: isWooSessionTokenError,
  });

  assert.deepEqual(sent, ['stale', 'fresh']);
  assert.equal(result.sessionWasReset, true);
  assert.equal(result.sessionToken, 'fresh');
  assert.deepEqual(result.body, {data: {addToCart: {cart: {isEmpty: false}}}});
});

test('add-to-cart sends once without a stored token or for an unrelated error', async () => {
  for (const sessionToken of [null, 'current']) {
    const sent = [];
    const result = await sendWithWooSessionRecovery({
      sessionToken,
      send: async (token) => {
        sent.push(token);
        return {body: {errors: [{message: 'Sorry, this product cannot be purchased.'}]}, issuedToken: 'issued'};
      },
      isStaleSessionError: isWooSessionTokenError,
    });

    assert.deepEqual(sent, [sessionToken]);
    assert.equal(result.sessionWasReset, false);
    assert.equal(result.sessionToken, 'issued');
  }
});
