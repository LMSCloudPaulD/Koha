/**
 * Patron data transformation and search utilities.
 * @module adapters/patron
 *
 * ## Fallback Drift Risk
 *
 * `buildPatronSearchQuery` delegates to `window.buildPatronSearchQuery` when available,
 * falling back to a simplified local implementation. This creates a maintenance risk:
 *
 * - The fallback may drift from the real implementation as Koha evolves
 * - The fallback lacks support for extended attribute searching
 * - Search behavior may differ between staff interface (has global) and tests (uses fallback)
 *
 * If patron search behaves unexpectedly, verify that the global function is loaded
 * before the booking modal initializes. The fallback logs a warning when used.
 */

import { win } from "./globals.js";
/**
 * Builds a search query for patron searches
 * This is a wrapper around the global buildPatronSearchQuery function
 * @param {string} term - The search term
 * @param {Object} [options] - Search options
 * @param {string} [options.search_type] - 'contains' or 'starts_with'
 * @param {string} [options.search_fields] - Comma-separated list of fields to search
 * @param {Array} [options.extended_attribute_types] - Extended attribute types to search
 * @param {string} [options.table_prefix] - Table name prefix for fields
 * @returns {Array} Query conditions for the API
 */
export function buildPatronSearchQuery(term, options = {}) {
    /** @type {((term: string, options?: object) => any) | null} */
    const globalBuilder =
        typeof win("buildPatronSearchQuery") === "function"
            ? /** @type {any} */ (win("buildPatronSearchQuery"))
            : null;
    if (globalBuilder) {
        return globalBuilder(term, options);
    }

    // Fallback implementation if the global function is not available
    console.warn(
        "window.buildPatronSearchQuery is not available, using fallback implementation"
    );
    const q = [];
    if (!term) return q;

    const table_prefix = options.table_prefix || "me";
    const search_fields = options.search_fields
        ? options.search_fields.split(",").map(f => f.trim())
        : ["surname", "firstname", "cardnumber", "userid"];

    search_fields.forEach(field => {
        q.push({
            [`${table_prefix}.${field}`]: {
                like: `%${term}%`,
            },
        });
    });

    return [{ "-or": q }];
}

/**
 * Calculates age in years from a date of birth string.
 * @param {string} dateOfBirth - ISO date string (YYYY-MM-DD)
 * @returns {number|null} Age in whole years, or null if invalid
 */
export function getAgeFromDob(dateOfBirth) {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

/**
 * Transforms patron data into a consistent format for display.
 * The label (used by vue-select for filtering/selection display) shows:
 *   Surname, Firstname (cardnumber)
 * Additional fields (age, library) are available for the custom #option slot.
 * @param {Object} patron - The patron object to transform
 * @returns {import('../../types/bookings').PatronOption | null} Transformed patron object with a display label
 */
export function transformPatronData(patron) {
    if (!patron) return null;

    return {
        ...patron,
        label: [
            patron.surname,
            patron.firstname,
            patron.cardnumber ? `(${patron.cardnumber})` : "",
        ]
            .filter(Boolean)
            .join(" ")
            .trim(),
        _age: getAgeFromDob(patron.date_of_birth),
        _libraryName: patron.library?.name || null,
    };
}

/**
 * Transforms an array of patrons using transformPatronData
 * @param {Array|Object} data - The patron data (single object or array)
 * @returns {Array|Object} Transformed patron(s)
 */
export function transformPatronsData(data) {
    if (!data) return [];

    const patrons = Array.isArray(data) ? data : data.results || [];
    return patrons.map(transformPatronData);
}
