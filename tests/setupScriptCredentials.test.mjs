import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const setupScriptPath = fileURLToPath(new URL('../scripts/setup-script.js', import.meta.url));

test('optional KV population is skipped when Cloudflare credentials are absent', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'woonuxt-setup-script-'));

  try {
    const result = spawnSync(process.execPath, [setupScriptPath], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        CF_ACCOUNT_ID: '',
        CF_API_TOKEN: '',
        CLOUDFLARE_API_TOKEN: '',
        CF_KV_NAMESPACE_ID_SCRIPT_DATA: '',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Cloudflare KV credentials are not configured; skipping optional KV population\./,
    );
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
});
