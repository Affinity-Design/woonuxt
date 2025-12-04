import {defineNitroPlugin} from 'nitropack/dist/runtime/plugin';

export default defineNitroPlugin((nitroApp) => {
  // Hook into the global fetch to intercept outgoing requests
  // This is the most reliable way to ensure the User-Agent is set for server-to-server calls
  nitroApp.hooks.hook('fetch:request', (ctx) => {
    // Check if the request is targeting the WordPress GraphQL endpoint
    // We check for 'graphql' in the URL
    const url = ctx.request.toString();
    if (url.includes('graphql')) {
      // Ensure headers object exists
      ctx.options.headers = ctx.options.headers || {};

      // Force the User-Agent header
      // This bypasses the WordPress Turnstile plugin which whitelists this specific User-Agent
      if (ctx.options.headers instanceof Headers) {
        ctx.options.headers.set('User-Agent', 'ProSkatersPlaceFrontend');
      } else {
        (ctx.options.headers as any)['User-Agent'] = 'ProSkatersPlaceFrontend';
      }

      // Also ensure X-Frontend-Type is set
      if (ctx.options.headers instanceof Headers) {
        ctx.options.headers.set('X-Frontend-Type', 'woonuxt');
      } else {
        (ctx.options.headers as any)['X-Frontend-Type'] = 'woonuxt';
      }
    }
  });
});
