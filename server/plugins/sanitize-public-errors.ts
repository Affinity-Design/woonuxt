import {defineNitroPlugin} from 'nitropack/dist/runtime/plugin';

function getPublicMessageForStatus(statusCode: number): string {
  if (statusCode === 400 || statusCode === 422) return 'The request could not be completed. Please review your information and try again.';
  if (statusCode === 401) return 'Please sign in and try again.';
  if (statusCode === 403) return 'You do not have permission to complete that request.';
  if (statusCode === 404) return 'The requested page or item could not be found.';
  if (statusCode === 409) return 'That request conflicts with a recent change. Refresh the page and try again.';
  if (statusCode === 429) return 'Too many requests were made. Please wait a moment and try again.';
  return 'Something went wrong. Please try again. If the problem continues, contact customer service.';
}

function replaceErrorProperty(error: Record<string, unknown>, key: string, value: unknown): void {
  try {
    Object.defineProperty(error, key, {value, writable: true, configurable: true, enumerable: key !== 'stack'});
  } catch {
    // Some framework errors have non-configurable properties. Assign where possible.
    try {
      error[key] = value;
    } catch {
      // The custom error page still refuses to render any untrusted error text.
    }
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (untrustedError) => {
    if (!untrustedError || typeof untrustedError !== 'object') return;

    const error = untrustedError as unknown as Record<string, unknown>;
    const parsedStatusCode = Number(error.statusCode ?? error.status);
    const statusCode = Number.isInteger(parsedStatusCode) && parsedStatusCode >= 400 && parsedStatusCode <= 599 ? parsedStatusCode : 500;
    const publicMessage = getPublicMessageForStatus(statusCode);

    replaceErrorProperty(error, 'statusCode', statusCode);
    replaceErrorProperty(error, 'message', publicMessage);
    replaceErrorProperty(error, 'statusMessage', publicMessage);
    replaceErrorProperty(error, 'data', undefined);
    replaceErrorProperty(error, 'cause', undefined);
    replaceErrorProperty(error, 'stack', undefined);
  });
});
