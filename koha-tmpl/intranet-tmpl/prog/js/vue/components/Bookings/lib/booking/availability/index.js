/**
 * Availability module barrel - aggregates the public surface used by
 * external callers (BookingModal, the bookings store, useAvailability,
 * useBookingCalendarMaps). Internal helpers (period validators, marker
 * builders, conflict resolvers) stay scoped to their sibling files
 * and are imported directly from there.
 *
 * @module availability
 */

export {
    extractBookingConfiguration,
    toEffectiveRules,
    calculateMaxBookingPeriod,
} from "./rules.js";

export {
    calculateMaxEndDate,
    getAvailableItemsForPeriod,
} from "./period-validators.js";

export {
    buildUnavailableByDateMap,
    addHolidayMarkers,
} from "./unavailable-map.js";

export { calculateDisabledDates, buildIntervalTree } from "./disabled-dates.js";

export { findFirstBlockingDate } from "./date-change.js";
