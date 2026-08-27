import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  getSafeAuthenticationErrorMessage,
  getSafeErrorLogDetails,
  getSafePaymentErrorMessage,
  getSafePublicErrorMessage,
  getSafeDiagnosticUrl,
  removeSensitiveFields,
} from '../utils/publicErrorMessages.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listSourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
    } else if (/\.(?:ts|js|mjs|vue)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test('registration errors never return GraphQL input or credentials', () => {
  const exposedPassword = 'Correct-Horse-Battery-Staple!';
  const exposedEmail = 'customer@example.com';
  const graphQlError = {
    gqlErrors: [
      {
        message: `Variable "$input" got invalid value {"email":"${exposedEmail}","password":"${exposedPassword}","username":"customer"}; Field "username" is not defined by type "RegisterCustomerInput".`,
      },
    ],
  };

  const publicMessage = getSafeAuthenticationErrorMessage(graphQlError, 'register');

  assert.equal(publicMessage, 'We could not create your account. Please review your details and try again.');
  assert.doesNotMatch(publicMessage, new RegExp(exposedPassword));
  assert.doesNotMatch(publicMessage, new RegExp(exposedEmail));
  assert.doesNotMatch(publicMessage, /Variable|GraphQL|RegisterCustomerInput|username/i);
});

test('known authentication and payment failures use fixed human-readable copy', () => {
  assert.equal(
    getSafeAuthenticationErrorMessage({message: 'incorrect_password: hunter2'}, 'signIn'),
    'The email, username, or password is incorrect. Please try again.',
  );
  assert.equal(
    getSafeAuthenticationErrorMessage({message: 'Wordfence 2FA rejected code 123456'}, 'signIn'),
    'Enter a valid two-factor authentication code and try again.',
  );
  assert.equal(
    getSafePaymentErrorMessage({message: 'issuer declined card ending 4242'}),
    'The payment was declined. Please check your card details or use another payment method.',
  );
});

test('generic public errors ignore untrusted text and diagnostics omit messages and stacks', () => {
  const privateError = Object.assign(new Error('password=do-not-print'), {
    code: 'NETWORK_ERROR',
    statusCode: 502,
    response: {body: {password: 'do-not-print'}},
  });

  assert.equal(getSafePublicErrorMessage(privateError, 'Please try again.'), 'Please try again.');
  assert.deepEqual(getSafeErrorLogDetails(privateError), {errorName: 'Error', statusCode: 502, errorCode: 'NETWORK_ERROR'});
  assert.deepEqual(getSafeErrorLogDetails({name: 'passwordValue', code: 'customer-secret', statusCode: 400}), {statusCode: 400});
});

test('diagnostic URLs drop query strings and fragments', () => {
  assert.equal(
    getSafeDiagnosticUrl('https://proskatersplace.ca/my-account/reset?key=secret-reset-key&password=hidden#private'),
    'https://proskatersplace.ca/my-account/reset',
  );
});

test('credential fields are removed recursively before recovery storage', () => {
  const sanitized = removeSensitiveFields({
    account: {
      username: 'shopper',
      password: 'never-store-this',
      password_confirmation: 'never-store-this',
      userPasswordHint: 'never-store-this',
      apiKeySid: 'never-store-this',
      turnstileToken: 'never-store-this-either',
      nested: {newPassword: 'also-private', safePreference: 'email'},
    },
    cardToken: 'required-server-side-payment-reference',
  });

  assert.deepEqual(sanitized, {
    account: {username: 'shopper', nested: {safePreference: 'email'}},
    cardToken: 'required-server-side-payment-reference',
  });
});

test('public UI and API source files do not directly reflect raw error details', async () => {
  const sourceDirectories = [
    'components',
    'composables',
    'pages',
    'plugins',
    'modules',
    'server/api',
    'server/middleware',
    'server/plugins',
    'server/routes',
    'server/utils',
    'workers',
  ].map((directory) => path.join(repositoryRoot, directory));
  const sourceFiles = (await Promise.all(sourceDirectories.map(listSourceFiles))).flat();
  const violations = [];
  const forbiddenPatterns = [
    {label: 'raw error rendered as HTML', pattern: /v-html="(?:errorMessage|paymentError|cardError|productError|loadError|turnstileError|status\.error)"/},
    {
      label: 'raw error assigned to public UI state',
      pattern: /(?:errorMessage|paymentError|cardError|productError|loadError)\.value\s*=\s*(?:error|err)\??\.message/,
    },
    {
      label: 'raw error object assigned to public UI state',
      pattern: /(?:errorMessage|paymentError|cardError|productError|loadError)\.value\s*=\s*(?:error|err|e)\b/,
    },
    {label: 'raw error reflected by API', pattern: /(?:statusMessage|message|error|warning|details|data)\s*:\s*(?:error|err|e)\??\.message/},
    {label: 'raw error interpolated by API', pattern: /(?:statusMessage|message|error|warning|details|data)\s*:\s*`[^`]*\$\{(?:error|err|e)\??\.message/},
    {
      label: 'raw conditional error reflected by API',
      pattern: /(?:statusMessage|message|error|warning|details|data)\s*:[^\n]*(?:error|err|e)\s+instanceof\s+Error\s*\?\s*(?:error|err|e)\.message/,
    },
    {label: 'stack reflected by API', pattern: /(?:stack|details)\s*:\s*(?:error|err|e)\??\.stack/},
    {label: 'GraphQL errors returned by API', pattern: /graphqlErrors\s*:/},
    {label: 'raw error object written to a console', pattern: /^\s*console\.(?:log|warn|error)\(\s*(?:error|err|e)\s*\)/m},
    {
      label: 'raw request or provider payload written to a console',
      pattern: /^\s*console\.(?:log|warn|error)\([^\n]*,\s*(?:result|response|body|payload|transactionData|customerInfo|customerRequest)\s*\)/m,
    },
    {label: 'rejected secret fragment written to diagnostics', pattern: /(?:provided|supplied) secret|providedSecret\.substring|secret\.substring/i},
  ];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    for (const {label, pattern} of forbiddenPatterns) {
      if (pattern.test(source)) violations.push(`${path.relative(repositoryRoot, sourceFile)}: ${label}`);
    }
  }

  assert.deepEqual(violations, []);
});

test('registration and diagnostics use strict allowlists', async () => {
  const useAuthSource = await readFile(path.join(repositoryRoot, 'composables/useAuth.ts'), 'utf8');
  const beaconSource = await readFile(path.join(repositoryRoot, 'plugins/error-beacon.client.ts'), 'utf8');
  const diagnosticReaderSource = await readFile(path.join(repositoryRoot, 'server/api/client-errors.get.ts'), 'utf8');

  assert.match(useAuthSource, /GqlLogin\(\{username, password\}/);
  assert.doesNotMatch(useAuthSource, /GqlLogin\(\s*(?:credentials|extendedCredentials)/);
  assert.match(useAuthSource, /GqlRegisterCustomer\(\s*\{input: \{email, password\}\}/);
  assert.doesNotMatch(useAuthSource, /GqlRegisterCustomer\(\s*\{input\}/);
  assert.doesNotMatch(beaconSource, /\bmessage\s*:/);
  assert.doesNotMatch(beaconSource, /\bstack\s*:/);
  assert.doesNotMatch(diagnosticReaderSource, /READ_TOKEN|query\.key/);
  assert.match(diagnosticReaderSource, /verifyAdminSession/);
});

test('global Nuxt and Nitro error fallbacks never serialize raw error text', async () => {
  const errorPageSource = await readFile(path.join(repositoryRoot, 'error.vue'), 'utf8');
  const serverSanitizerSource = await readFile(path.join(repositoryRoot, 'server/plugins/sanitize-public-errors.ts'), 'utf8');

  assert.doesNotMatch(errorPageSource, /error\??\.(?:message|statusMessage|stack|data|cause)/);
  assert.match(serverSanitizerSource, /hooks\.hook\('error'/);
  assert.match(serverSanitizerSource, /replaceErrorProperty\(error, 'message', publicMessage\)/);
  assert.match(serverSanitizerSource, /replaceErrorProperty\(error, 'stack', undefined\)/);
  assert.match(serverSanitizerSource, /replaceErrorProperty\(error, 'data', undefined\)/);
});

test('WordPress payment diagnostics never persist or return raw provider errors', async () => {
  const refundHandlerSource = await readFile(path.join(repositoryRoot, 'wordpress/mu-plugins/helcim-refund-error-handler.php'), 'utf8');
  const legacyRefundHandlerSource = await readFile(path.join(repositoryRoot, 'wordpress/helcim-refund-errors.php'), 'utf8');
  const orderNumberBridgeSource = await readFile(path.join(repositoryRoot, 'wordpress/hpos-ordernumber-fix.php'), 'utf8');
  const paymentShippingSource = await readFile(path.join(repositoryRoot, 'wordpress/psp-master-payment-shipping-code-snippets.php'), 'utf8');

  assert.doesNotMatch(refundHandlerSource, /Response Body|Request URL|'raw_body'\s*=>|'response'\s*=>/);
  assert.doesNotMatch(refundHandlerSource, /\$messages\[\]\s*=\s*\$(?:error|data)/);
  assert.match(refundHandlerSource, /current_user_can\('manage_woocommerce'\)/);
  assert.doesNotMatch(legacyRefundHandlerSource, /refund_error_raw|Show raw API response|\$messages\[\]\s*=\s*\$(?:err|data)/);
  assert.match(legacyRefundHandlerSource, /current_user_can\('manage_woocommerce'\)/);
  assert.doesNotMatch(orderNumberBridgeSource, /->getMessage\(/);
  assert.doesNotMatch(paymentShippingSource, /psp_log_pos_customer_profile_message\([^\n]*\$(?:billing_email|new_customer_id)/);
});

test('WPGraphQL sanitizes every error before it leaves WordPress', async () => {
  const graphQlSanitizerSource = await readFile(path.join(repositoryRoot, 'wordpress/mu-plugins/psp-graphql-error-sanitizer.php'), 'utf8');

  assert.match(graphQlSanitizerSource, /add_filter\('graphql_request_results'/);
  assert.match(graphQlSanitizerSource, /add_filter\('graphql_http_request_response_errors'/);
  assert.match(graphQlSanitizerSource, /psp_sanitize_graphql_error_list\(\$response\['errors'\]\)/);
  assert.match(graphQlSanitizerSource, /unset\(\$response\['extensions'\]\['debug'\]\)/);
  assert.doesNotMatch(graphQlSanitizerSource, /\['message'\]\s*=\s*\$untrusted_message/);
});

test('payment and order responses omit diagnostic and token-bearing payloads', async () => {
  const orderApiSource = await readFile(path.join(repositoryRoot, 'server/api/create-admin-order.post.ts'), 'utf8');
  const checkoutSource = await readFile(path.join(repositoryRoot, 'pages/checkout/index.vue'), 'utf8');
  const helcimCardSource = await readFile(path.join(repositoryRoot, 'components/shopElements/HelcimCard.vue'), 'utf8');
  const helcimValidationSource = await readFile(path.join(repositoryRoot, 'server/api/helcim-validate.post.ts'), 'utf8');

  assert.doesNotMatch(orderApiSource, /result:\s*result/);
  assert.doesNotMatch(orderApiSource, /(?:billing|lineItems|metaData):\s*orderData/);
  assert.doesNotMatch(checkoutSource, /console\.log\([^\n]*Helcim payment completed[^\n]*,\s*result/);
  assert.doesNotMatch(helcimCardSource, /captureLog\([^\n]*customerInfo/);
  assert.doesNotMatch(helcimCardSource, /hashValue\s*:/);
  assert.doesNotMatch(helcimValidationSource, /console\.log\('\[Helcim Validation\]'[\s\S]{0,500}(?:expectedHash|receivedHash)/);
});

test('server credentials are never accepted in query strings', async () => {
  const apiFiles = await listSourceFiles(path.join(repositoryRoot, 'server/api'));
  const apiSource = (await Promise.all(apiFiles.map((file) => readFile(file, 'utf8')))).join('\n');

  assert.doesNotMatch(apiSource, /query\??\.secret/);
  assert.doesNotMatch(apiSource, /getQuery\([^)]*\)[^\n]*secret/);
});

test('root overrides block inherited raw HTML error renderers', async () => {
  const requiredOverrides = [
    'error.vue',
    'components/forms/LoginAndRegister.vue',
    'components/forms/ChangePassword.vue',
    'components/forms/ResetPassword.vue',
    'components/productElements/ReviewsScore.vue',
    'components/shopElements/AddCoupon.vue',
    'pages/order-summary-cpy.vue',
  ];

  for (const relativePath of requiredOverrides) {
    const overrideSource = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
    assert.doesNotMatch(overrideSource, /v-html="[^"]*(?:error|message|notice)[^"]*"/);
    assert.doesNotMatch(overrideSource, /\{\{\s*(?:props\.)?error(?:\?|\.)/);
  }
});
