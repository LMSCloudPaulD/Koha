/**
 * Core availability calculation logic for the booking system.
 *
 * This module has been split into focused sub-modules for better maintainability.
 * All exports are re-exported from ./availability/index.js for backward compatibility.
 *
 * Sub-modules:
 * - ./availability/rules.js - Circulation rules utilities
 * - ./availability/period-validators.js - Period validation utilities
 * - ./availability/unavailable-map.js - Unavailable date map builders
 * - ./availability/disabled-dates.js - Main calculateDisabledDates function
 * - ./availability/date-change.js - Date change handlers
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
} from "./availability/index.js";
