/**
 * Utilities for comparing and handling mixed string/number IDs consistently
 * @module id-utils
 */

/**
 * Compare two IDs for equality, handling mixed string/number types
 * @param {string|number|null|undefined} a - First ID to compare
 * @param {string|number|null|undefined} b - Second ID to compare
 * @returns {boolean} True if IDs are equal (after string conversion)
 */
export function idsEqual(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

/**
 * Check if a list contains a target ID, handling mixed string/number types
 * @param {Array<string|number>} list - Array of IDs to search
 * @param {string|number} target - ID to find
 * @returns {boolean} True if target ID is found in the list
 */
export function includesId(list, target) {
    if (!Array.isArray(list)) return false;
    return list.some(id => idsEqual(id, target));
}

/**
 * Normalize an identifier's type to match a sample (number|string) for strict comparisons.
 * If sample is a number, casts value to number; otherwise casts to string.
 * Falls back to string when sample is null/undefined.
 *
 * @param {unknown} sample - A sample value to infer the desired type from
 * @param {unknown} value - The value to normalize
 * @returns {string|number|null}
 */
export function normalizeIdType(sample, value) {
    if (value == null) return null;
    return typeof sample === "number" ? Number(value) : String(value);
}
