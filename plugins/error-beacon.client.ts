/**
 * TEMPORARY diagnostic error beacon (2026-08 product-page interactivity incident).
 *
 * Captures client-side JS errors, unhandled promise rejections, and a
 * "hydration completed" ping, then POSTs them to /api/client-errors where they
 * are KV-stored for remote inspection. Mobile browsers have no devtools, so
 * this is the only way to see what breaks on real customer devices.
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
      url: window.location.href,
      ua: navigator.userAgent,
      ts: Date.now(),
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
      message: String(e.message || '').slice(0, 500),
      source: String(e.filename || '').slice(0, 300),
      line: e.lineno,
      col: e.colno,
      stack: String(e.error?.stack || '').slice(0, 1200),
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    queue({
      type: 'unhandledrejection',
      message: String(reason?.message || reason || '').slice(0, 500),
      stack: String(reason?.stack || '').slice(0, 1200),
    });
  });

  // Vue-level errors that Vue catches itself (these never hit window.onerror)
  nuxtApp.hook('vue:error', (err: any, _instance, info) => {
    queue({
      type: 'vue:error',
      message: String(err?.message || err || '').slice(0, 500),
      info: String(info || '').slice(0, 120),
      stack: String(err?.stack || '').slice(0, 1200),
    });
  });

  // Positive signal: hydration finished and listeners are attached.
  nuxtApp.hook('app:mounted', () => {
    queue({type: 'mounted', sinceNavStartMs: Math.round(performance.now())});
  });

  window.addEventListener('pagehide', send);
});
