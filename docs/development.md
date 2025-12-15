# Development Guide

## Prerequisites

- Node.js (see `package.json` for version)
- npm

## Key Scripts (from `package.json`)

- `npm run dev` — Start local development server
- `npm run build` — Build for production
- `npm run generate` — Generate static site
- `npm run serve` — Serve the generated static site
- `npm run setup-cache` — Prepare local cache for development
- `npm run warm-cache` — Warm up cache with data from backend

## Local Development

1. Clone the repo and install dependencies:
   ```sh
   npm install
   ```
2. Start the dev server:
   ```sh
   npm run dev:ssl:local
   ```
3. The app will be available at `http://localhost:3000` (or as configured).

## Build & Deployment

- Use `npm run build` to build for production.
- Use `npm run generate` for static site generation (SSG).
- Deploy `.output/public` to your static hosting provider.

## Configuration

- See `nuxt.config.ts` for route rules, caching, and module setup.
- Environment variables (e.g., GraphQL endpoint) are managed via `.env` files.
