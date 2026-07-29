import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Nuxt does not expose standalone account registration', async () => {
  const [accountForm, authComposable] = await Promise.all([
    readProjectFile('components/forms/LoginAndRegister.vue'),
    readProjectFile('composables/useAuth.ts'),
  ]);

  assert.doesNotMatch(accountForm, /navigate\(['"]register['"]\)/);
  assert.doesNotMatch(accountForm, /formView\.value\s*===\s*['"]register['"]/);
  assert.doesNotMatch(authComposable, /GqlRegisterCustomer/);
});

test('Turnstile secret remains server-only', async () => {
  const nuxtConfig = await readProjectFile('nuxt.config.ts');
  const publicConfigStart = nuxtConfig.indexOf('public: {');
  const secretConfigPosition = nuxtConfig.indexOf('turnstyleSecretKey: process.env.TURNSTYLE_SECRET_KEY');

  assert.notEqual(secretConfigPosition, -1);
  assert.ok(secretConfigPosition < publicConfigStart, 'Turnstile secret must be declared before the public runtime config block');
});

test('WordPress policy removes standalone GraphQL registration mutations', async () => {
  const policyPlugin = await readProjectFile('wordpress/mu-plugins/psp-checkout-only-registration.php');

  assert.match(policyPlugin, /deregister_graphql_field\( 'RootMutation', 'registerUser' \)/);
  assert.match(policyPlugin, /deregister_graphql_field\( 'RootMutation', 'registerCustomer' \)/);
  assert.match(policyPlugin, /woocommerce_registration_errors/);
  assert.match(policyPlugin, /registration_errors/);
});
