# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:** None configured

**No testing dependencies found in root `package.json`** — no Jest, Vitest, Playwright, Cypress, or any test runner.

**Run Commands:**

```bash
# No test commands available
# `npm test` is not defined
```

## Test File Organization

**Location:** No automated test files exist in the project.

The `specs/` directory at root contains **planning and specification documents**, not automated tests:

```
specs/
└── 001-fix-shipping-quote-glitch/
    ├── spec.md          # Feature specification
    ├── plan.md          # Implementation plan
    ├── tasks.md         # Work items
    ├── research.md      # Technical research notes
    ├── quickstart.md    # Developer notes
    ├── data-model.md    # Data structure docs
    └── checklists/
        └── requirements.md
```

These are GSD (Get Stuff Done) planning artifacts, not code tests.

## Test Types

**Unit Tests:** Not present
**Integration Tests:** Not present
**E2E Tests:** Not present
**Component Tests (Vue Test Utils):** Not present

## Current Quality Verification Strategy

In the absence of automated tests, the project relies on:

1. **TypeScript type checking** — enforced at build time via `nuxt build`
2. **Prettier formatting** — enforced via `.prettierrc` (no pre-commit hook observed)
3. **Manual verification via Nuxt dev server** — `npm run dev`
4. **GSD specification checklists** — `specs/*/checklists/requirements.md` documents acceptance criteria manually
5. **Cloudflare KV cache debugging** — `npm run debug:cache` for cache-layer issues
6. **Browser-based smoke testing** — implied by `npm run preview`

## Coverage

**Requirements:** None enforced (no coverage tooling)

## Recommended Test Setup (If Adding Tests)

Given the Nuxt 3 stack, the standard approach would be:

**Unit/Component testing:**

```bash
npm install -D vitest @vue/test-utils @nuxt/test-utils
```

**Config (`vitest.config.ts`):**

```typescript
import {defineVitestConfig} from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
  },
});
```

**Composable test pattern (future):**

```typescript
import {describe, it, expect} from 'vitest';
import {mountSuspended} from '@nuxt/test-utils/runtime';

describe('useCart', () => {
  it('should initialize with null cart', async () => {
    // composables use useState — requires nuxt test environment
  });
});
```

**High-priority candidates for first tests (by risk):**

- `utils/priceConverter.ts` — Pure functions, no Nuxt dependencies, easy to unit test. CAD conversion logic is critical to business correctness.
- `composables/useHelpers.ts` — `arraysEqual`, `formatVariationArrays`, `formatArray` are pure functions
- `server/api/create-admin-order.post.ts` — High complexity, high business impact, currently untested
- `composables/useExchangeRate.ts` — Rate caching/staleness logic is subtle and error-prone

## Notes on Testability

**Challenges in the current codebase:**

- Heavy reliance on Nuxt auto-imports (`useRoute`, `useState`, `useRuntimeConfig`) makes unit testing composables without the full Nuxt environment difficult
- `// @ts-ignore` usage (16+ instances) indicates type safety gaps that automated tests would catch
- Server API routes use `readBody`, `useRuntimeConfig`, `defineEventHandler` — these require `@nuxt/test-utils` or manual mocking
- `useCachedProduct.ts` and `useExchangeRate.ts` use `$fetch` and cookies — need fetch mocking
- Cloudflare KV storage (`useStorage('cache')`) is a platform-specific dependency with no mock setup

**Testable without Nuxt environment (pure functions):**

- `utils/priceConverter.ts` — `cleanAndExtractPriceInfo`, `convertToCAD`, `formatPriceWithCAD`
- `utils/javascript.ts` — utility helpers
- `composables/useHelpers.ts` — `arraysEqual`, `formatVariationArrays`, `formatArray`, `replaceQueryParam`

---

_Testing analysis: 2026-04-09_
