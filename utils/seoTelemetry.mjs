const MAXIMUM_DEBUG_TARGET_LENGTH = 100;

export function createCumulativeLayoutShiftAnalyticsPayload(metric, pageLocation) {
  const largestShiftTarget = String(metric?.attribution?.largestShiftTarget || 'unknown').slice(0, MAXIMUM_DEBUG_TARGET_LENGTH);

  return {
    value: metric.delta,
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    metric_navigation_type: metric.navigationType,
    debug_target: largestShiftTarget,
    page_location: pageLocation,
  };
}
