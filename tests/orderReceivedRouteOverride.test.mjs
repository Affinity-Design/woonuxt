import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadNuxt} from 'nuxt';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedReceiptPage = path.resolve(repositoryRoot, 'pages/checkout/order-received/[...orderId].vue');
const staleBaseReceiptPage = path.resolve(repositoryRoot, 'woonuxt_base/app/pages/order-summary.vue');

function normalizePath(filePath) {
  return path.normalize(filePath || '');
}

test('the production order-received route uses the root receipt component', async () => {
  const nuxt = await loadNuxt({cwd: repositoryRoot, ready: false});

  try {
    const pages = [];

    // Nuxt registers layer config hooks from the base layer to the root layer.
    // Replaying that order catches a future base route that would otherwise
    // bypass the normal root page override behavior.
    for (const layer of [...nuxt.options._layers].reverse()) {
      const extendPages = layer.config?.hooks?.['pages:extend'];
      if (typeof extendPages === 'function') await extendPages(pages);
    }

    const receiptRoute = pages.find((page) => page.name === 'order-received');

    assert.ok(receiptRoute, 'Expected a named order-received route');
    assert.equal(receiptRoute.path, '/checkout/order-received/:orderId');
    assert.equal(normalizePath(receiptRoute.file), normalizePath(expectedReceiptPage));
    assert.notEqual(normalizePath(receiptRoute.file), normalizePath(staleBaseReceiptPage));
  } finally {
    await nuxt.close();
  }
});
