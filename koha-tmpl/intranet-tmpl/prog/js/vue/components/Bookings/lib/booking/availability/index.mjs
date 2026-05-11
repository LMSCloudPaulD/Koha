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
} from "./rules.mjs";

export {
    calculateMaxEndDate,
    getAvailableItemsForPeriod,
} from "./period-validators.mjs";

export {
    buildUnavailableByDateMap,
    addHolidayMarkers,
} from "./unavailable-map.mjs";

export {
    calculateDisabledDates,
    buildIntervalTree,
} from "./disabled-dates.mjs";

export { findFirstBlockingDate } from "./date-change.mjs";
