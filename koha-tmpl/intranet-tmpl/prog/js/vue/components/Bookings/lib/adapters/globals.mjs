/**
 * Safe accessors for window-scoped globals using bracket notation
 */

/**
 * Get a value from window by key using bracket notation
 *
 * @param {string} key
 * @returns {unknown}
 */
export function win(key) {
    if (typeof window === "undefined") return undefined;
    return window[key];
}
