/**
 * @module opacBookingApi
 * @description Service module for all OPAC booking-related API calls.
 * All functions return promises and use async/await.
 *
 * ## Stub Functions
 *
 * Some functions are stubs that exist only for API compatibility with the
 * staff interface booking module:
 *
 * - `fetchPatrons()` - Returns empty array. Patron search is not needed in OPAC
 *   because the logged-in patron is automatically used.
 *
 * These stubs allow the booking components to use the same store actions
 * regardless of whether they're running in staff or OPAC context.
 *
 * ## Relationship with staff-interface.js
 *
 * This module mirrors the API of staff-interface.js but uses public API endpoints.
 * The two files share ~60% similar code. If modifying one, check if the same
 * change is needed in the other.
 */

import { bookingValidation } from "../../booking/validation-messages.js";

/**
 * Fetches bookable items for a given biblionumber
 * @param {number|string} biblionumber - The biblionumber to fetch items for
 * @returns {Promise<Array<Object>>} Array of bookable items
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchBookableItems(biblionumber) {
    if (!biblionumber) {
        throw bookingValidation.validationError("biblionumber_required");
    }

    const response = await fetch(
        `/api/v1/public/biblios/${encodeURIComponent(biblionumber)}/items`,
        {
            headers: {
                "x-koha-embed": "+strings",
            },
        }
    );

    if (!response.ok) {
        throw bookingValidation.validationError("fetch_bookable_items_failed", {
            status: response.status,
            statusText: response.statusText,
        });
    }

    return await response.json();
}

/**
 * Fetches bookings for a given biblionumber
 * @param {number|string} biblionumber - The biblionumber to fetch bookings for
 * @returns {Promise<Array<Object>>} Array of bookings
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchBookings(biblionumber) {
    if (!biblionumber) {
        throw bookingValidation.validationError("biblionumber_required");
    }

    const response = await fetch(
        `/api/v1/public/biblios/${encodeURIComponent(
            biblionumber
        )}/bookings?_per_page=-1&q={"status":{"-in":["new","pending","active"]}}`
    );

    if (!response.ok) {
        throw bookingValidation.validationError("fetch_bookings_failed", {
            status: response.status,
            statusText: response.statusText,
        });
    }

    return await response.json();
}

/**
 * Fetches checkouts for a given biblionumber
 * @param {number|string} biblionumber - The biblionumber to fetch checkouts for
 * @returns {Promise<Array<Object>>} Array of checkouts
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchCheckouts(biblionumber) {
    if (!biblionumber) {
        throw bookingValidation.validationError("biblionumber_required");
    }

    const response = await fetch(
        `/api/v1/public/biblios/${encodeURIComponent(biblionumber)}/checkouts`
    );

    if (!response.ok) {
        throw bookingValidation.validationError("fetch_checkouts_failed", {
            status: response.status,
            statusText: response.statusText,
        });
    }

    return await response.json();
}

/**
 * Fetches a single patron by ID
 * @param {number|string} patronId - The ID of the patron to fetch
 * @returns {Promise<Object>} The patron object
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchPatron(patronId) {
    const response = await fetch(`/api/v1/public/patrons/${patronId}`, {
        headers: { "x-koha-embed": "library" },
    });

    if (!response.ok) {
        throw bookingValidation.validationError("fetch_patron_failed", {
            status: response.status,
            statusText: response.statusText,
        });
    }

    return await response.json();
}

/**
 * Searches for patrons - not used in OPAC
 * @returns {Promise<Array>}
 */
export async function fetchPatrons() {
    return [];
}

/**
 * Fetches pickup locations for a biblionumber, optionally filtered by patron
 * @param {number|string} biblionumber - The biblionumber to fetch pickup locations for
 * @param {number|string|null} [patronId] - Optional patron ID to filter pickup locations
 * @returns {Promise<Array<Object>>} Array of pickup location objects
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchPickupLocations(biblionumber, patronId) {
    if (!biblionumber) {
        throw bookingValidation.validationError("biblionumber_required");
    }

    const params = new URLSearchParams({
        _order_by: "name",
        _per_page: "-1",
    });

    if (patronId) {
        params.append("patron_id", patronId);
    }

    const response = await fetch(
        `/api/v1/public/biblios/${encodeURIComponent(
            biblionumber
        )}/pickup_locations?${params.toString()}`
    );

    if (!response.ok) {
        throw bookingValidation.validationError(
            "fetch_pickup_locations_failed",
            {
                status: response.status,
                statusText: response.statusText,
            }
        );
    }

    return await response.json();
}

/**
 * Fetches circulation rules for booking constraints
 * Now uses the enhanced circulation_rules endpoint with date calculation capabilities
 * @param {Object} params - Parameters for circulation rules query
 * @param {string|number} [params.patron_category_id] - Patron category ID
 * @param {string|number} [params.item_type_id] - Item type ID
 * @param {string|number} [params.library_id] - Library ID
 * @param {string} [params.start_date] - Start date for calculations (ISO format)
 * @param {string} [params.rules] - Comma-separated list of rule kinds (defaults to booking rules)
 * @param {boolean} [params.calculate_dates] - Whether to calculate dates (defaults to true for bookings)
 * @returns {Promise<Object>} Object containing circulation rules with calculated dates
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchCirculationRules(params = {}) {
    const filteredParams = {};
    for (const key in params) {
        if (
            params[key] !== null &&
            params[key] !== undefined &&
            params[key] !== ""
        ) {
            filteredParams[key] = params[key];
        }
    }

    if (filteredParams.calculate_dates === undefined) {
        filteredParams.calculate_dates = true;
    }

    if (!filteredParams.rules) {
        filteredParams.rules =
            "bookings_lead_period,bookings_trail_period,issuelength,renewalsallowed,renewalperiod";
    }

    const urlParams = new URLSearchParams();
    Object.entries(filteredParams).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        urlParams.set(k, String(v));
    });

    const response = await fetch(
        `/api/v1/public/circulation_rules?${urlParams.toString()}`
    );

    if (!response.ok) {
        throw bookingValidation.validationError(
            "fetch_circulation_rules_failed",
            {
                status: response.status,
                statusText: response.statusText,
            }
        );
    }

    return await response.json();
}

/**
 * Fetches holidays (closed days) for a library.
 * Stub — no public holidays endpoint exists yet; returns empty array
 * so the calendar renders without holiday highlighting in OPAC context.
 * @param {string} _libraryId - The library branchcode (unused)
 * @param {string} [_from] - Start date (unused)
 * @param {string} [_to] - End date (unused)
 * @returns {Promise<string[]>} Always returns empty array
 */
export async function fetchHolidays(_libraryId, _from, _to) {
    return [];
}

/** Stub — OPAC booking creation not implemented */
export async function createBooking() {
    return {};
}

/** Stub — OPAC booking update not implemented */
export async function updateBooking() {
    return {};
}
