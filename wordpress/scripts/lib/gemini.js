#!/usr/bin/env node
/**
 * lib/gemini.js
 * Shared Gemini API helper for all Tier 2 content-generation scripts.
 *
 * Usage in scripts:
 *   const { generateContent, generateContentWithSystem } = require('./lib/gemini');
 *
 * Env vars (either name works):
 *   GEMINI_API_KEY=...       ← preferred convention (matches Google docs)
 *   GOOGLE_AI_API_KEY=...    ← also accepted (already in .env)
 *
 * Default model: gemini-3-flash-preview  (override with GEMINI_MODEL env var or
 *   the model option on each call)
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

// ─── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

// Max requests per minute — preview models are more restricted; use 10 RPM
// as a conservative safe default.  Increase via GEMINI_RPM env var if on a
// paid tier with higher limits.
const RPM = parseInt(process.env.GEMINI_RPM || '10', 10);
const MIN_DELAY_MS = Math.ceil(60000 / RPM); // ms to wait between calls

// Exponential backoff config
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2000; // 2 s, doubles each retry → 2s, 4s, 8s, 16s

// ─── Client ───────────────────────────────────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  throw new Error(
    '[gemini.js] Missing API key — set GEMINI_API_KEY or GOOGLE_AI_API_KEY in .env',
  );
}

const ai = new GoogleGenAI({ apiKey });

// ─── Rate-limiting state ───────────────────────────────────────────────────────

let lastCallAt = 0;

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastCallAt = Date.now();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  // 429 = rate limit, 500/503 = transient server error
  const status = err?.status || err?.statusCode || 0;
  return status === 429 || status === 500 || status === 503;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Generate text content with Gemini.
 *
 * @param {string} prompt          — The user prompt
 * @param {object} [options]
 * @param {string} [options.model] — Override model (default: gemini-3-flash-preview)
 * @param {string} [options.system]— System instruction string
 * @param {number} [options.temperature] — Sampling temperature (default: 1.0)
 * @returns {Promise<string>}      — response.text
 */
async function generateContent(prompt, options = {}) {
  const model = options.model || DEFAULT_MODEL;

  const config = {};
  if (options.system) {
    config.systemInstruction = options.system;
  }
  if (options.temperature !== undefined) {
    config.temperature = options.temperature;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      });

      return response.text;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;

      if (isRetryable(err) && !isLast) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `  ⚠️  Gemini ${err?.status || 'error'} on attempt ${attempt + 1}/${MAX_RETRIES + 1} — retrying in ${backoff / 1000}s`,
        );
        await sleep(backoff);
        continue;
      }

      throw err;
    }
  }
}

/**
 * Convenience wrapper: generateContent with a fixed system instruction.
 * Useful when all calls in a script share the same persona/voice.
 *
 * @param {string} prompt
 * @param {string} system  — System instruction (voice/persona)
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function generateContentWithSystem(prompt, system, opts = {}) {
  return generateContent(prompt, { ...opts, system });
}

/**
 * Batch-generate content for an array of prompts with progress logging.
 * Processes sequentially (rate limiting is built in).
 *
 * @param {string[]} prompts
 * @param {object} [options]   — Same options as generateContent
 * @param {function} [onProgress] — Called with (index, total, result) after each item
 * @returns {Promise<string[]>}
 */
async function batchGenerate(prompts, options = {}, onProgress = null) {
  const results = [];
  for (let i = 0; i < prompts.length; i++) {
    const result = await generateContent(prompts[i], options);
    results.push(result);
    if (onProgress) {
      onProgress(i, prompts.length, result);
    } else {
      console.log(`  [${i + 1}/${prompts.length}] generated (${result.length} chars)`);
    }
  }
  return results;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateContent,
  generateContentWithSystem,
  batchGenerate,
  DEFAULT_MODEL,
  MIN_DELAY_MS,
};
