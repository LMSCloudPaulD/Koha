/**
 * Shared constants for the booking system (business logic + UI)
 * @module constants
 */

/** @constant {string} Constraint mode for end-date-only selection */
export const CONSTRAINT_MODE_END_DATE_ONLY = "end_date_only";
/** @constant {string} Constraint mode for normal date range selection */
export const CONSTRAINT_MODE_NORMAL = "normal";

// UI class names (used across calendar/adapters/composables)
export const CLASS_BOOKING_CONSTRAINED_RANGE_MARKER =
    "booking-constrained-range-marker";
export const CLASS_BOOKING_DAY_HOVER_LEAD = "booking-day--hover-lead";
export const CLASS_BOOKING_DAY_HOVER_TRAIL = "booking-day--hover-trail";
export const CLASS_BOOKING_INTERMEDIATE_BLOCKED =
    "booking-intermediate-blocked";
export const CLASS_BOOKING_MARKER_COUNT = "booking-marker-count";
export const CLASS_BOOKING_MARKER_DOT = "booking-marker-dot";
export const CLASS_BOOKING_MARKER_GRID = "booking-marker-grid";
export const CLASS_BOOKING_MARKER_ITEM = "booking-marker-item";
export const CLASS_BOOKING_OVERRIDE_ALLOWED = "booking-override-allowed";
export const CLASS_FLATPICKR_DAY = "flatpickr-day";
export const CLASS_FLATPICKR_DISABLED = "flatpickr-disabled";
export const CLASS_FLATPICKR_NOT_ALLOWED = "notAllowed";
export const CLASS_BOOKING_LOAN_BOUNDARY = "booking-loan-boundary";

// Data attributes
export const DATA_ATTRIBUTE_BOOKING_OVERRIDE = "data-booking-override";

// Calendar range constants (days)
export const CALENDAR_BUFFER_DAYS = 7;
export const DEFAULT_LOOKAHEAD_DAYS = 90;
export const MAX_SEARCH_DAYS = 365;
export const DEFAULT_MAX_PERIOD_DAYS = 30;

// Calendar highlighting retry configuration
export const HIGHLIGHTING_MAX_RETRIES = 5;

// Calendar navigation delay (ms) - allows Flatpickr to settle before jumping
export const CALENDAR_NAVIGATION_DELAY_MS = 100;

// Debounce delays (ms)
export const PATRON_SEARCH_DEBOUNCE_MS = 250;
export const HOLIDAY_EXTENSION_DEBOUNCE_MS = 150;

// Holiday prefetch configuration
export const HOLIDAY_PREFETCH_THRESHOLD_DAYS = 60;
export const HOLIDAY_PREFETCH_MONTHS = 6;

// Marker type mapping (IntervalTree/Sweep reasons → CSS class names)
export const MARKER_TYPE_MAP = Object.freeze({
    booking: "booked",
    core: "booked",
    checkout: "checked-out",
});
