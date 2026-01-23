/**
 * Toast notification composable
 * Provides a clean, modern toast notification system
 */

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => []);

  /**
   * Strip HTML tags from a string
   */
  function stripHtmlTags(text: string): string {
    if (!text) return text;
    // Remove HTML tags and their content for links, scripts, styles
    let stripped = text
      .replace(/<a\b[^>]*>.*?<\/a>/gi, '') // Remove anchor tags completely
      .replace(/<script\b[^>]*>.*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    return stripped;
  }

  /**
   * Decode HTML entities in a string
   */
  function decodeHtmlEntities(text: string): string {
    if (!text) return text;

    const entities: Record<string, string> = {
      '&quot;': '"',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&apos;': "'",
      '&#39;': "'",
      '&nbsp;': ' ',
      '&mdash;': '\u2014',
      '&ndash;': '\u2013',
      '&hellip;': '\u2026',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019',
      '&ldquo;': '\u201C',
      '&rdquo;': '\u201D',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }

    // Handle numeric entities like &#34;
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

    return decoded;
  }

  /**
   * Clean message: decode HTML entities and strip HTML tags
   */
  function cleanMessage(text: string): string {
    return stripHtmlTags(decodeHtmlEntities(text));
  }

  /**
   * Show a toast notification
   */
  function showToast(message: string, type: Toast['type'] = 'info', duration: number = 5000) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Clean the message: decode HTML entities and strip HTML tags
    const cleanedMessage = cleanMessage(message);

    const toast: Toast = {
      id,
      message: cleanedMessage,
      type,
      duration,
    };

    toasts.value.push(toast);

    // Auto-remove toast after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }

  /**
   * Remove a toast by ID
   */
  function removeToast(id: string) {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  }

  /**
   * Show a success toast
   */
  function success(message: string, duration?: number) {
    return showToast(message, 'success', duration);
  }

  /**
   * Show an error toast
   */
  function error(message: string, duration?: number) {
    return showToast(message, 'error', duration ?? 7000); // Errors show longer
  }

  /**
   * Show a warning toast
   */
  function warning(message: string, duration?: number) {
    return showToast(message, 'warning', duration ?? 6000);
  }

  /**
   * Show an info toast
   */
  function info(message: string, duration?: number) {
    return showToast(message, 'info', duration);
  }

  /**
   * Clear all toasts
   */
  function clearAll() {
    toasts.value = [];
  }

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
    clearAll,
  };
}
