// composables/useDebounceFn.ts

import { customRef } from 'vue';

/**
 * Creates a debounced version of a function
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced function
 */
export function useDebounceFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function debouncedFn(...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Creates a debounced ref
 * @param value The initial value
 * @param delay The delay in milliseconds
 * @returns A debounced ref
 */
export function useDebouncedRef<T>(value: T, delay: number = 300) {
  return customRef((track, trigger) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return {
      get() {
        track();
        return value;
      },
      set(newValue: T) {
        if (timeout) {
          clearTimeout(timeout);
        }
        
        timeout = setTimeout(() => {
          value = newValue;
          trigger();
        }, delay);
      }
    };
  });
}

export default useDebounceFn;
