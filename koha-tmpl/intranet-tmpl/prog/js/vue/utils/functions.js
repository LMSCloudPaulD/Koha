/**
 * Generic utility functions for Vue components
 */

/**
 * Creates a debounced version of a function that delays invocation
 * until after `delay` milliseconds have elapsed since the last call.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn - The function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {(...args: Parameters<T>) => void}
 */
export function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}
