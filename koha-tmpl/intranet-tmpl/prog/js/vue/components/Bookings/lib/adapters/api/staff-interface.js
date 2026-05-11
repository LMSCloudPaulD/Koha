/**
 * @module bookingApi
 * @description Service module for all booking-related API calls.
 * All functions return promises and use async/await.
 */

import { APIClient } from "../../../../../fetch/api-client.js";
import { bookingValidation } from "../../booking/validation-messages.js";
import { buildPatronSearchQuery } from "../patron.mjs";

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

    return APIClient.biblio.biblios.items(
        encodeURIComponent(biblionumber),
        { bookable: 1 },
        { "x-koha-embed": "+strings,item_type" }
    );
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

    return APIClient.biblio.biblios.bookings(encodeURIComponent(biblionumber), {
        status: { "-in": ["new", "pending", "active"] },
    });
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

    return APIClient.biblio.biblios.checkouts(encodeURIComponent(biblionumber));
}

/**
 * Fetches a single patron by ID
 * @param {number|string} patronId - The ID of the patron to fetch
 * @returns {Promise<Object>} The patron object
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchPatron(patronId) {
    if (!patronId) {
        throw bookingValidation.validationError("patron_id_required");
    }

    return APIClient.patron.patrons.get(encodeURIComponent(patronId), {
        "x-koha-embed": "library",
    });
}

/**
 * Searches for patrons matching a search term
 * @param {string} term - The search term to match against patron names, cardnumbers, etc.
 * @param {number} [page=1] - The page number for pagination
 * @returns {Promise<Object>} Object containing patron search results
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchPatrons(term, page = 1) {
    if (!term) {
        return { results: [] };
    }

    const query = buildPatronSearchQuery(term, {
        search_type: "contains",
    });

    return APIClient.patron.patrons.search(
        query,
        {
            _page: String(page),
            _per_page: "10",
            _order_by: "surname,firstname",
        },
        {
            "x-koha-embed": "library",
            Accept: "application/json",
        }
    );
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

    const params = {
        _order_by: "name",
    };

    if (patronId) {
        params.patron_id = String(patronId);
    }

    return APIClient.biblio.biblios.pickup_locations(
        encodeURIComponent(biblionumber),
        params
    );
}

/**
 * Fetches circulation rules based on the provided context parameters
 * @param {Object} [params={}] - Context parameters for circulation rules
 * @param {string|number} [params.patron_category_id] - Patron category ID
 * @param {string|number} [params.item_type_id] - Item type ID
 * @param {string|number} [params.library_id] - Library ID
 * @param {string} [params.start_date] - Start date for calculations (ISO format)
 * @param {string} [params.rules] - Comma-separated list of rule kinds
 * @param {boolean} [params.calculate_dates] - Whether to calculate dates
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

    if (!filteredParams.rules) {
        filteredParams.rules =
            "bookings_lead_period,bookings_trail_period,issuelength,renewalsallowed,renewalperiod";
    }

    return APIClient.circulation_rules.rules.get(filteredParams);
}

/**
 * Fetches holidays (closed days) for a library within a date range
 * @param {string} libraryId - The library ID (branchcode)
 * @param {string} [from] - Start date for the range (ISO format)
 * @param {string} [to] - End date for the range (ISO format)
 * @returns {Promise<string[]>} Array of holiday dates in YYYY-MM-DD format
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function fetchHolidays(libraryId, from, to) {
    if (!libraryId) {
        return [];
    }

    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;

    return APIClient.library.libraries.closed_dates(
        encodeURIComponent(libraryId),
        params
    );
}

/**
 * Creates a new booking
 * @param {Object} bookingData - The booking data to create
 * @param {string} bookingData.start_date - Start date of the booking (ISO 8601 format)
 * @param {string} bookingData.end_date - End date of the booking (ISO 8601 format)
 * @param {number|string} bookingData.biblio_id - Biblionumber for the booking
 * @param {number|string} [bookingData.item_id] - Optional item ID for the booking
 * @param {number|string} bookingData.patron_id - Patron ID for the booking
 * @param {number|string} bookingData.pickup_library_id - Pickup library ID
 * @returns {Promise<Object>} The created booking object
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function createBooking(bookingData) {
    if (!bookingData) {
        throw bookingValidation.validationError("booking_data_required");
    }

    const validationError = bookingValidation.validateRequiredFields(
        bookingData,
        [
            "start_date",
            "end_date",
            "biblio_id",
            "patron_id",
            "pickup_library_id",
        ]
    );

    if (validationError) {
        throw validationError;
    }

    return APIClient.booking.bookings.create(bookingData);
}

/**
 * Updates an existing booking
 * @param {number|string} bookingId - The ID of the booking to update
 * @param {Object} bookingData - The updated booking data
 * @param {string} [bookingData.start_date] - New start date (ISO 8601 format)
 * @param {string} [bookingData.end_date] - New end date (ISO 8601 format)
 * @param {number|string} [bookingData.pickup_library_id] - New pickup library ID
 * @param {number|string} [bookingData.item_id] - New item ID
 * @returns {Promise<Object>} The updated booking object
 * @throws {Error} If the request fails or returns a non-OK status
 */
export async function updateBooking(bookingId, bookingData) {
    if (!bookingId) {
        throw bookingValidation.validationError("booking_id_required");
    }

    if (!bookingData || Object.keys(bookingData).length === 0) {
        throw bookingValidation.validationError("no_update_data");
    }

    return APIClient.booking.bookings.update(
        encodeURIComponent(bookingId),
        bookingData
    );
}
