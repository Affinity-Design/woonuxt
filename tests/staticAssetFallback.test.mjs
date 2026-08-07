import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const headersPath = new URL('../public/_headers', import.meta.url);
const notFoundPath = new URL('../public/404.html', import.meta.url);
const nuxtConfigPath = new URL('../nuxt.config.ts', import.meta.url);

test('missing Nuxt assets are not relabeled or cached as immutable files', async () => {
  const headers = await readFile(headersPath, 'utf8');

  assert.doesNotMatch(headers, /^\/_nuxt\/\*\./m);
  assert.match(headers, /^\/_nuxt\/builds\/latest\.json$/m);
  assert.match(headers, /^  ! Cache-Control$/m);
  assert.match(headers, /Cache-Control: no-cache, must-revalidate/);
});

test('Nitro does not generate a blanket immutable rule for Nuxt assets', async () => {
  const nuxtConfig = await readFile(nuxtConfigPath, 'utf8');

  assert.match(nuxtConfig, /'\/_nuxt\/\*\*': \{cache: \{maxAge: 0\}\}/);
});

test('client asset hashes use a fresh lowercase-only alphabet', async () => {
  const nuxtConfig = await readFile(nuxtConfigPath, 'utf8');

  assert.match(nuxtConfig, /hashCharacters: 'base36'/);
});

test('Cloudflare Pages has a top-level static 404 document', async () => {
  const notFound = await readFile(notFoundPath, 'utf8');

  assert.match(notFound, /<title>Page Not Found \| ProSkaters Place Canada<\/title>/);
  assert.match(notFound, /<h1>404<\/h1>/);
  assert.match(notFound, /<meta name="robots" content="noindex" \/>/);
});
