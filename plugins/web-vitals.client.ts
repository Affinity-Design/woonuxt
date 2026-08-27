import {onCLS, type CLSMetricWithAttribution} from 'web-vitals/attribution';
import {createCumulativeLayoutShiftAnalyticsPayload} from '~/utils/seoTelemetry.mjs';

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, eventParameters: Record<string, unknown>) => void;
  }
}

export default defineNuxtPlugin(() => {
  const reportCumulativeLayoutShift = (metric: CLSMetricWithAttribution) => {
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', metric.name, createCumulativeLayoutShiftAnalyticsPayload(metric, window.location.href));
  };

  // Register once per full page load. The attribution build names the element
  // responsible for the largest shift so field failures become actionable.
  onCLS(reportCumulativeLayoutShift);
});
