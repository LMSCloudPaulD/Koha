import { BookingDate } from "./BookingDate.js";
import { calculateMaxEndDate } from "./availability.js";
import {
    CONSTRAINT_MODE_END_DATE_ONLY,
    CONSTRAINT_MODE_NORMAL,
} from "./constants.js";
import {
    queryRangeAndResolve,
    createConflictContext,
} from "./conflict-resolution.js";

/**
 * Base strategy with shared logic for date-selection enforcement.
 * Mode-specific strategies override methods as needed.
 */
const BaseStrategy = {
    name: "base",

    /**
     * Validate if a start date should be blocked.
     * @returns {boolean} true to block, false to allow
     */
    validateStartDateSelection() {
        return false;
    },

    /**
     * Handle intermediate dates between start and end.
     * Base implementation has no special handling.
     */
    handleIntermediateDate() {
        return null;
    },

    /**
     * Enforce end date selection rules.
     * Base implementation allows any end date.
     */
    enforceEndDateSelection() {
        return { ok: true };
    },
};

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
 * Strategy for end_date_only constraint mode.
 * Users must select the exact end date calculated from start + period.
 */
const EndDateOnlyStrategy = {
    ...BaseStrategy,
    name: CONSTRAINT_MODE_END_DATE_ONLY,

    validateStartDateSelection(
        dayjsDate,
        config,
        intervalTree,
        selectedItem,
        editBookingId,
        allItemIds,
        selectedDates
    ) {
        if (!selectedDates || selectedDates.length === 0) {
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
        return handleEndDateOnlyIntermediateDate(
            dayjsDate,
            selectedDates,
            config
        );
    },

    enforceEndDateSelection(dayjsStart, dayjsEnd, circulationRules) {
        if (!dayjsEnd) return { ok: true };

        const dueStr = circulationRules?.calculated_due_date;
        let targetEnd;
        if (dueStr) {
            const due = BookingDate.from(dueStr).toDayjs();
            if (!due.isBefore(dayjsStart, "day")) {
                targetEnd = due;
            }
        }
        if (!targetEnd) {
            const numericMaxPeriod =
                Number(circulationRules?.maxPeriod) ||
                Number(circulationRules?.issuelength) ||
                0;
            // Use calculateMaxEndDate for consistency: end = start + (maxPeriod - 1), as start is day 1
            targetEnd = calculateMaxEndDate(
                dayjsStart,
                Math.max(1, numericMaxPeriod)
            );
        }
        return {
            ok: dayjsEnd.isSame(targetEnd, "day"),
            expectedEnd: targetEnd,
        };
    },
};

/**
 * Strategy for normal constraint mode.
 * Users can select any valid date range within the max period.
 */
const NormalStrategy = {
    ...BaseStrategy,
    name: CONSTRAINT_MODE_NORMAL,
    // Uses all base implementations - no overrides needed
};

/**
 * Factory function to get the appropriate strategy for a constraint mode.
 * @param {string} mode - The constraint mode (CONSTRAINT_MODE_END_DATE_ONLY or CONSTRAINT_MODE_NORMAL)
 * @returns {Object} The strategy object
 */
export function createConstraintStrategy(mode) {
    return mode === CONSTRAINT_MODE_END_DATE_ONLY
        ? EndDateOnlyStrategy
        : NormalStrategy;
}
