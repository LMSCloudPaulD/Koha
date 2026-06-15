import { BookingDate } from "./BookingDate.js";
import { calculateMaxEndDate } from "./availability.js";
import { CONSTRAINT_MODE_END_DATE_ONLY } from "./constants.js";
import {
    queryRangeAndResolve,
    createConflictContext,
} from "./conflict-resolution.js";

/**
 * Validate start date for end_date_only mode.
 * Checks if the entire booking period (start to calculated end) is available.
 * @public
 */
export function validateEndDateOnlyStartDate(
    date,
    config,
    intervalTree,
    selectedItem,
    editBookingId,
    allItemIds
) {
    // Determine target end date based on backend due date override when available
    let targetEndDate;
    const due = config?.calculatedDueDate || null;
    if (due && !due.isBefore(date, "day")) {
        targetEndDate = due.clone();
    } else {
        const maxPeriod = Number(config?.maxPeriod) || 0;
        targetEndDate =
            maxPeriod > 0
                ? calculateMaxEndDate(date, maxPeriod).toDate()
                : date;
    }

    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);

    // The end date is forced to targetEndDate, so the start date is only
    // viable when at least one item is conflict-free across the whole
    // range. queryRangeAndResolve implements exactly that: single-item
    // mode blocks on any conflict, any-item mode blocks when every item
    // has a conflict somewhere in [start, targetEnd]. A per-day check
    // would under-block: two items with disjoint single-day conflicts
    // leave no day fully blocked, yet neither can serve the full period.
    const result = queryRangeAndResolve(
        intervalTree,
        date.valueOf(),
        targetEndDate.valueOf(),
        ctx
    );
    return result.hasConflict;
}

/**
 * Handle intermediate date clicks for end_date_only mode.
 * Returns true to disable, null to allow normal handling.
 * @public
 */
export function handleEndDateOnlyIntermediateDate(date, selectedDates, config) {
    if (!selectedDates || selectedDates.length !== 1) {
        return null;
    }

    const startDate = BookingDate.from(selectedDates[0]).toDayjs();

    // Prefer backend due date when provided
    const due = config?.calculatedDueDate;
    if (due && !due.isBefore(startDate, "day")) {
        const expectedEndDate = due.clone();
        if (date.isSame(expectedEndDate, "day")) return null;
        if (date.isAfter(expectedEndDate, "day")) return true;
        return null; // intermediate left to UI highlighting + click prevention
    }

    // Fall back to maxPeriod handling
    const maxPeriod = Number(config?.maxPeriod) || 0;
    if (!maxPeriod) return null;

    const expectedEndDate = calculateMaxEndDate(startDate, maxPeriod);
    if (date.isSame(expectedEndDate, "day")) return null;
    if (date.isAfter(expectedEndDate, "day")) return true;
    return null;
}

/**
 * Returns the date-selection handlers for a constraint mode.
 *
 * Normal mode imposes no extra start/intermediate restrictions — the
 * disable function alone governs range selection. end_date_only mode forces
 * the end date to start + period, so it validates the whole period up front
 * and rejects clicks past the computed end.
 *
 * @param {string} mode - CONSTRAINT_MODE_END_DATE_ONLY or CONSTRAINT_MODE_NORMAL
 */
export function createConstraintStrategy(mode) {
    const isEndDateOnly = mode === CONSTRAINT_MODE_END_DATE_ONLY;
    return {
        validateStartDateSelection(
            dayjsDate,
            config,
            intervalTree,
            selectedItem,
            editBookingId,
            allItemIds,
            selectedDates
        ) {
            if (
                isEndDateOnly &&
                (!selectedDates || selectedDates.length === 0)
            ) {
                return validateEndDateOnlyStartDate(
                    dayjsDate,
                    config,
                    intervalTree,
                    selectedItem,
                    editBookingId,
                    allItemIds
                );
            }
            return false;
        },

        handleIntermediateDate(dayjsDate, selectedDates, config) {
            return isEndDateOnly
                ? handleEndDateOnlyIntermediateDate(
                      dayjsDate,
                      selectedDates,
                      config
                  )
                : null;
        },
    };
}
