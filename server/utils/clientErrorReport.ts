import {getSafeDiagnosticUrl} from '#shared/utils/publicErrorMessages.mjs';

const ALLOWED_EVENT_TYPES = new Set(['error', 'unhandledrejection', 'vue:error', 'mounted']);

function readBoundedNumber(value: unknown, maximum: number): number | undefined {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 && numberValue <= maximum ? numberValue : undefined;
}

function createSafeClientEvent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;

  const event = value as Record<string, unknown>;
  const type = typeof event.type === 'string' && ALLOWED_EVENT_TYPES.has(event.type) ? event.type : '';
  if (!type) return null;

  const safeEvent: Record<string, unknown> = {type};
  const source = getSafeDiagnosticUrl(event.source);
  const line = readBoundedNumber(event.line, 10_000_000);
  const column = readBoundedNumber(event.column ?? event.col, 10_000_000);
  const sinceNavigationStartMilliseconds = readBoundedNumber(event.sinceNavigationStartMilliseconds ?? event.sinceNavStartMs, 86_400_000);

  if (source) safeEvent.source = source;
  if (line !== undefined) safeEvent.line = line;
  if (column !== undefined) safeEvent.column = column;
  if (sinceNavigationStartMilliseconds !== undefined) safeEvent.sinceNavigationStartMilliseconds = sinceNavigationStartMilliseconds;

  return safeEvent;
}

export function createSafeClientErrorReport(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;

  const report = value as Record<string, unknown>;
  const events = Array.isArray(report.events) ? report.events.map(createSafeClientEvent).filter(Boolean).slice(0, 15) : [];
  if (events.length === 0) return null;

  const sessionId = typeof report.sessionId === 'string' && /^[a-z0-9]{1,16}$/i.test(report.sessionId) ? report.sessionId : 'unknown';
  const url = getSafeDiagnosticUrl(report.url);
  const timestamp = readBoundedNumber(report.timestamp ?? report.ts, Number.MAX_SAFE_INTEGER) ?? Date.now();
  const userAgent = typeof (report.userAgent ?? report.ua) === 'string' ? String(report.userAgent ?? report.ua).slice(0, 300) : '';

  return {
    sessionId,
    ...(url ? {url} : {}),
    ...(userAgent ? {userAgent} : {}),
    timestamp,
    events,
  };
}
