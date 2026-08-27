/**
 * TEMPORARY diagnostic error beacon (2026-08 product-page interactivity incident).
 *
 * Captures allowlisted client-side failure metadata and a "hydration completed"
 * ping, then POSTs them to /api/client-errors. Error messages, stacks, query
 * strings, form values, and promise rejection values are never transmitted.
 *
 * Remove this plugin (and server/api/client-errors.*) once the incident is
 * closed — tracked in PR notes.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const MAX_EVENTS = 15;
  const events: Record<string, unknown>[] = [];
  let sent = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const sessionId = Math.random().toString(36).slice(2, 10);

  const send = () => {
    if (!events.length) return;
    const batch = events.splice(0, events.length);
    sent += batch.length;
    const payload = JSON.stringify({
      sessionId,
      url: `${window.location.origin}${window.location.pathname}`,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      events: batch,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-errors', new Blob([payload], {type: 'application/json'}));
      } else {
        fetch('/api/client-errors', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: payload, keepalive: true});
      }
    } catch {
      /* beacon must never break the page */
    }
  };

  const queue = (event: Record<string, unknown>) => {
    if (sent + events.length >= MAX_EVENTS) return;
    events.push(event);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(send, 2000);
  };

  window.addEventListener('error', (e) => {
    queue({
      type: 'error',
      source: e.filename,
      line: e.lineno,
      column: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', () => {
    queue({type: 'unhandledrejection'});
  });

  // Vue-level errors that Vue catches itself (these never hit window.onerror)
  nuxtApp.hook('vue:error', () => {
    queue({type: 'vue:error'});
  });

  // Positive signal: hydration finished and listeners are attached.
  nuxtApp.hook('app:mounted', () => {
    queue({type: 'mounted', sinceNavigationStartMilliseconds: Math.round(performance.now())});
  });

  window.addEventListener('pagehide', send);
});
