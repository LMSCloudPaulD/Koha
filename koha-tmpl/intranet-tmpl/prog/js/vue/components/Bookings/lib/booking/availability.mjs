/**
 * Core availability calculation logic for the booking system.
 *
 * This module has been split into focused sub-modules for better maintainability.
 * All exports are re-exported from ./availability/index.mjs for backward compatibility.
 *
 * Sub-modules:
 * - ./availability/rules.mjs - Circulation rules utilities
 * - ./availability/period-validators.mjs - Period validation utilities
 * - ./availability/unavailable-map.mjs - Unavailable date map builders
 * - ./availability/disabled-dates.mjs - Main calculateDisabledDates function
 * - ./availability/date-change.mjs - Date change handlers
 *
 * @module availability
 */

export {
    extractBookingConfiguration,
    toEffectiveRules,
    calculateMaxBookingPeriod,
    calculateMaxEndDate,
    getAvailableItemsForPeriod,
    buildUnavailableByDateMap,
    addHolidayMarkers,
    calculateDisabledDates,
    buildIntervalTree,
    findFirstBlockingDate,
} from "./availability/index.mjs";
