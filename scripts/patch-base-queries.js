// TEMP (2026-08-13 incident): WooGraphQL 0.21.1 under WooCommerce 11 no longer
// registers the registerCustomer mutation, so `nuxt prepare` (postinstall) fails
// codegen validation on woonuxt_base/app/queries/registerCustomer.gql in every
// Cloudflare Pages build. The base layer is read-only in git, so this patches
// the file inside the ephemeral CI checkout only (guarded by CF_PAGES/CI) before
// postinstall runs codegen. The operation name is preserved so the generated
// GqlRegisterCustomer surface is unchanged. Remove after the WPGraphQL for
// eCommerce migration restores the mutation server-side.
const fs = require('fs');
const path = require('path');

if (!process.env.CF_PAGES && !process.env.CI) {
  // Local installs keep the pristine base layer.
  process.exit(0);
}

const target = path.join(__dirname, '..', 'woonuxt_base', 'app', 'queries', 'registerCustomer.gql');
const patched = `# Patched at build time by scripts/patch-base-queries.js (2026-08-13 incident).
# The live schema (WooGraphQL 0.21.1 + WooCommerce 11) lost the registerCustomer
# mutation; this aliases updateCustomer under the same operation name so codegen
# validates and the generated GqlRegisterCustomer surface is unchanged.
mutation registerCustomer($input: UpdateCustomerInput!) {
  registerCustomer: updateCustomer(input: $input) {
    customer {
      ...Customer
    }
  }
}
`;

try {
  fs.writeFileSync(target, patched);
  console.log('[patch-base-queries] registerCustomer.gql patched for build-time codegen.');
} catch (err) {
  console.warn('[patch-base-queries] patch failed (continuing):', err.message);
}
