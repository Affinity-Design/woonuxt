import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginPath = path.join(repositoryRoot, 'wordpress/mu-plugins/psp-woocommerce-email-safety.php');

test('WooCommerce transactional emails bypass the credential-bearing deferred queue', async () => {
  const pluginSource = await readFile(pluginPath, 'utf8');

  assert.match(
    pluginSource,
    /add_filter\(\s*'woocommerce_defer_transactional_emails',\s*'__return_false',\s*PHP_INT_MAX,\s*1\s*\)/,
  );

  // This safeguard selects WooCommerce's normal synchronous dispatcher. It
  // must never send or replay emails itself, which could duplicate notices.
  assert.doesNotMatch(pluginSource, /\bwp_mail\s*\(/);
  assert.doesNotMatch(pluginSource, /send_queued_transactional_email/);
});
