import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {SANITIZED_SESSION_TOKEN_REJECTION, isWooSessionTokenError} from '../shared/utils/wooSession.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sanitizerPath = path.join(repositoryRoot, 'wordpress/mu-plugins/psp-graphql-error-sanitizer.php');

test('recognises WPGraphQL for eCommerce rejecting the stored session token', () => {
  assert.equal(isWooSessionTokenError({gqlErrors: [{message: 'invalid_token: Signature verification failed'}]}), true);
  assert.equal(isWooSessionTokenError([{message: 'invalid_token: Expired token'}]), true);
  assert.equal(isWooSessionTokenError({errors: [{message: 'invalid_token: The iss do not match with this server'}]}), true);
  // 0.21.x sent the bare reason (kept so a rollback recovers the same way).
  assert.equal(isWooSessionTokenError({gqlErrors: [{message: 'Signature verification failed'}]}), true);
  // Production: the WordPress sanitizer rewrites the reason to fixed copy.
  assert.equal(isWooSessionTokenError({gqlErrors: [{message: SANITIZED_SESSION_TOKEN_REJECTION}]}), true);
});

test('ignores cart failures and expired logins that are not a rejected session', () => {
  assert.equal(isWooSessionTokenError({gqlErrors: [{message: 'Sorry, this product cannot be purchased.'}]}), false);
  // Generic sanitizer copy for any message mentioning "session" is not specific enough to drop a cart.
  assert.equal(isWooSessionTokenError({gqlErrors: [{message: 'Your session expired. Refresh the page and try again.'}]}), false);
  // Headless Login answers an expired Bearer token with HTTP 403 and the reason only in extensions.debug.
  assert.equal(isWooSessionTokenError({statusCode: 403, gqlErrors: []}), false);
  assert.equal(isWooSessionTokenError(new Error('Cart refresh timed out')), false);
  assert.equal(isWooSessionTokenError(null), false);
});

test('the WordPress sanitizer maps a rejected session token to the exact copy the storefront matches', async () => {
  const sanitizerSource = await readFile(sanitizerPath, 'utf8');
  assert.ok(sanitizerSource.includes(`return '${SANITIZED_SESSION_TOKEN_REJECTION}';`), 'sanitizer copy out of sync with shared/utils/wooSession.mjs');

  // The PHP pattern is plain PCRE that JavaScript reads the same way; the sanitizer lowercases first and the rule trims.
  const [, pattern] = sanitizerSource.match(/preg_match\('\/(\^invalid_token:[^']*)\/', trim\(\$message\)\)/) || [];
  assert.ok(pattern, 'session-token rule not found in the sanitizer');
  const rule = new RegExp(pattern);
  const matches = (message) => rule.test(message.toLowerCase().trim());

  assert.equal(matches('invalid_token: Signature verification failed'), true);
  assert.equal(matches('invalid_token: Customer ID not found in the token'), true);
  assert.equal(matches('Expired token'), true);
  assert.equal(matches('Sorry, this product cannot be purchased.'), false);
  assert.equal(matches('Your session has expired'), false);

  // It must run before the generic rules that would otherwise claim these messages ("not found", "session").
  assert.ok(sanitizerSource.indexOf(pattern) < sanitizerSource.indexOf("strpos($message, 'session')"));
  assert.ok(sanitizerSource.indexOf(pattern) < sanitizerSource.indexOf("preg_match('/not found|invalid id/'"));
});
