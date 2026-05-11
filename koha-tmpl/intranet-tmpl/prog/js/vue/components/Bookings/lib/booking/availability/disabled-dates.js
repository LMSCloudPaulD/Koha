/**
 * Disabled dates calculation for booking availability.
 * Contains the main calculateDisabledDates function and createDisableFunction.
 * @module availability/disabled-dates
 */

import { BookingDate } from "../BookingDate.js";
import { createConstraintStrategy } from "../strategies.js";
import { buildIntervalTree } from "../algorithms/interval-tree.js";
import {
    CONSTRAINT_MODE_END_DATE_ONLY,
    CONSTRAINT_MODE_NORMAL,
} from "../constants.js";
import { extractBookingConfiguration } from "./rules.js";
import {
    calculateMaxEndDate,
    validateLeadPeriodOptimized,
    validateTrailPeriodOptimized,
    validateRangeOverlapForEndDate,
} from "./period-validators.js";
import {
    buildUnavailableByDateMap,
    addHolidayMarkers,
    addLeadPeriodFromTodayMarkers,
    addTheoreticalLeadPeriodMarkers,
} from "./unavailable-map.js";
import {
    queryPointAndResolve,
    createConflictContext,
} from "../conflict-resolution.js";

/**
 * Creates the main disable function that determines if a date should be disabled
 * @param {Object} intervalTree - Interval tree for conflict checking
 * @param {Object} config - Configuration object from extractBookingConfiguration
 * @param {Array<import('../../../types/bookings').BookableItem>} bookableItems - Array of bookable items
 * @param {string|null} selectedItem - Selected item ID or null
 * @param {number|null} editBookingId - Booking ID being edited
 * @param {Array<Date>} selectedDates - Currently selected dates
 * @param {Array<string>} holidays - Array of holiday dates in YYYY-MM-DD format
 * @returns {(date: Date) => boolean} Disable function for Flatpickr
 */
export function createDisableFunction(
    intervalTree,
    config,
    bookableItems,
    selectedItem,
    editBookingId,
    selectedDates,
    holidays = []
) {
    const {
        today,
        leadDays,
        trailDays,
        maxPeriod,
        isEndDateOnly,
        calculatedDueDate,
    } = config;
    const allItemIds = bookableItems.map(i => String(i.item_id));
    const strategy = createConstraintStrategy(
        isEndDateOnly ? CONSTRAINT_MODE_END_DATE_ONLY : CONSTRAINT_MODE_NORMAL
    );
    const conflictCtx = createConflictContext(
        selectedItem,
        editBookingId,
        allItemIds
    );

    const holidaySet = new Set(holidays);

    return date => {
        const dayjs_date = BookingDate.from(date).toDayjs();

        if (dayjs_date.isBefore(today, "day")) return true;

        // Only disable holidays when selecting START date - for END date selection,
        // we use click prevention instead so Flatpickr's range validation passes
        if (
            holidaySet.size > 0 &&
            (!selectedDates || selectedDates.length === 0)
        ) {
            const dateKey = dayjs_date.format("YYYY-MM-DD");
            if (holidaySet.has(dateKey)) {
                return true;
            }
        }

        if (!bookableItems || bookableItems.length === 0) {
            return true;
        }

        // Mode-specific start date validation
        if (
            strategy.validateStartDateSelection(
                dayjs_date,
                {
                    today,
                    leadDays,
                    trailDays,
                    maxPeriod,
                    isEndDateOnly,
                    calculatedDueDate,
                },
                intervalTree,
                selectedItem,
                editBookingId,
                allItemIds,
                selectedDates
            )
        ) {
            return true;
        }

        // Mode-specific intermediate date handling
        const intermediateResult = strategy.handleIntermediateDate(
            dayjs_date,
            selectedDates,
            {
                today,
                leadDays,
                trailDays,
                maxPeriod,
                isEndDateOnly,
                calculatedDueDate,
            }
        );
        if (intermediateResult === true) {
            return true;
        }

        const pointResult = queryPointAndResolve(
            intervalTree,
            dayjs_date.valueOf(),
            conflictCtx
        );

        if (pointResult.hasConflict) {
            return true;
        }

        // Lead/trail period validation using optimized queries
        if (!selectedDates || selectedDates.length === 0) {
            // Potential start date - check lead period
            if (leadDays > 0) {
                // Enforce minimum advance booking: start date must be >= today + leadDays
                // This applies even for the first booking (no existing bookings to conflict with)
                const minStartDate = today.add(leadDays, "day");
                if (dayjs_date.isBefore(minStartDate, "day")) {
                    return true;
                }
            }

            // Optimized lead period validation using range queries
            // This checks for conflicts with existing bookings in the lead window
            if (
                validateLeadPeriodOptimized(
                    dayjs_date,
                    leadDays,
                    intervalTree,
                    selectedItem,
                    editBookingId,
                    allItemIds
                )
            ) {
                return true;
            }
        } else if (
            selectedDates[0] &&
            dayjs_date.isSameOrBefore(
                BookingDate.from(selectedDates[0]).toDayjs(),
                "day"
            )
        ) {
            // Date is before or same as selected start - still needs validation as potential start
            // This handles the case where user clicks a date before their current selection
            // (which in Flatpickr range mode would reset and start a new range)
            if (leadDays > 0) {
                const minStartDate = today.add(leadDays, "day");
                if (dayjs_date.isBefore(minStartDate, "day")) {
                    return true;
                }
            }

            if (
                validateLeadPeriodOptimized(
                    dayjs_date,
                    leadDays,
                    intervalTree,
                    selectedItem,
                    editBookingId,
                    allItemIds
                )
            ) {
                return true;
            }
        } else if (
            selectedDates[0] &&
            dayjs_date.isAfter(
                BookingDate.from(selectedDates[0]).toDayjs(),
                "day"
            )
        ) {
            // Potential end date - any date after the start could become the new end
            // This applies whether we have an end date selected or not
            const start = BookingDate.from(selectedDates[0]).toDayjs();

            // Basic end date validations
            if (dayjs_date.isBefore(start, "day")) return true;

            // Calculate the target end date for fixed-duration modes
            let calculatedEnd = null;
            if (
                config.calculatedDueDate &&
                !config.calculatedDueDate.isBefore(start, "day")
            ) {
                calculatedEnd = config.calculatedDueDate;
            } else if (maxPeriod > 0) {
                calculatedEnd = calculateMaxEndDate(start, maxPeriod);
            }

            // In end_date_only mode, the target end date is ALWAYS selectable
            // Skip all other validation for it (trail period, range overlap, etc.)
            if (
                isEndDateOnly &&
                calculatedEnd &&
                dayjs_date.isSame(calculatedEnd, "day")
            ) {
                return false;
            }

            // Use backend-calculated due date when available (respects useDaysMode/calendar)
            // This correctly calculates the Nth opening day from start, skipping closed days
            // Fall back to simple maxPeriod arithmetic only if no calculated date
            if (calculatedEnd) {
                if (dayjs_date.isAfter(calculatedEnd, "day")) return true;
            }

            // Optimized trail period validation using range queries
            if (
                validateTrailPeriodOptimized(
                    dayjs_date,
                    trailDays,
                    intervalTree,
                    selectedItem,
                    editBookingId,
                    allItemIds
                )
            ) {
                return true;
            }

            // In end_date_only mode, intermediate dates are not disabled here
            // (they use click prevention instead for better UX)
            if (isEndDateOnly) {
                // Intermediate date - don't disable, click prevention handles it
                return false;
            }

            // Check if the booking range [start, end] would conflict with all items
            // This mirrors the backend's BETWEEN-based overlap detection
            if (
                validateRangeOverlapForEndDate(
                    start,
                    dayjs_date,
                    intervalTree,
                    selectedItem,
                    editBookingId,
                    allItemIds
                )
            ) {
                return true;
            }
        }

        return false;
    };
}

/**
 * Pure function for Flatpickr's `disable` option.
 * Disables dates that overlap with existing bookings or checkouts for the selected item, or when not enough items are available.
 * Also handles end_date_only constraint mode by disabling intermediate dates.
 *
 * @param {Array} bookings - Array of booking objects ({ booking_id, item_id, start_date, end_date })
 * @param {Array} checkouts - Array of checkout objects ({ item_id, due_date, ... })
 * @param {Array} bookableItems - Array of all bookable item objects (must have item_id)
 * @param {number|string|null} selectedItem - The currently selected item (item_id or null for 'any')
 * @param {number|string|null} editBookingId - The booking_id being edited (if any)
 * @param {Array} selectedDates - Array of currently selected dates in Flatpickr (can be empty, or [start], or [start, end])
 * @param {Object} circulationRules - Circulation rules object (leadDays, trailDays, maxPeriod, booking_constraint_mode, etc.)
 * @param {Date|import('dayjs').Dayjs} todayArg - Optional today value for deterministic tests
 * @param {Object} options - Additional options for optimization
 * @param {Array<string>} [options.holidays] - Array of holiday dates in YYYY-MM-DD format
 * @returns {import('../../../types/bookings').AvailabilityResult}
 */
export function calculateDisabledDates(
    bookings,
    checkouts,
    bookableItems,
    selectedItem,
    editBookingId,
    selectedDates = [],
    circulationRules = {},
    todayArg = undefined,
    options = {}
) {
    const holidays = options.holidays || [];
    const normalizedSelectedItem =
        selectedItem != null ? String(selectedItem) : null;

    // Build IntervalTree with all booking/checkout data
    const intervalTree = buildIntervalTree(
        bookings,
        checkouts,
        circulationRules
    );

    // Extract and validate configuration
    const config = extractBookingConfiguration(circulationRules, todayArg);
    const allItemIds = bookableItems.map(i => String(i.item_id));

    // Create optimized disable function using extracted helper
    const normalizedEditBookingId =
        editBookingId != null ? Number(editBookingId) : null;
    const disableFunction = createDisableFunction(
        intervalTree,
        config,
        bookableItems,
        normalizedSelectedItem,
        normalizedEditBookingId,
        selectedDates,
        holidays
    );

    // Build unavailableByDate for backward compatibility and markers
    // Pass options for performance optimization

    const unavailableByDate = buildUnavailableByDateMap(
        intervalTree,
        config.today,
        allItemIds,
        normalizedEditBookingId,
        options
    );

    addHolidayMarkers(unavailableByDate, holidays, allItemIds);

    addLeadPeriodFromTodayMarkers(
        unavailableByDate,
        config.today,
        config.leadDays,
        allItemIds
    );

    addTheoreticalLeadPeriodMarkers(
        unavailableByDate,
        intervalTree,
        config.today,
        config.leadDays,
        normalizedEditBookingId
    );

    return {
        disable: disableFunction,
        unavailableByDate: unavailableByDate,
    };
}

// Re-export buildIntervalTree for consumers that need direct access
export { buildIntervalTree };
