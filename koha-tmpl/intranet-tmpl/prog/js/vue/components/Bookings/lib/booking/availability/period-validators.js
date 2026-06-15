/**
 * Period validation utilities for booking availability.
 * @module availability/period-validators
 */

import { BookingDate } from "../BookingDate.js";
import {
    queryRangeAndResolve,
    createConflictContext,
} from "../conflict-resolution.js";
import { buildIntervalTree } from "../algorithms/interval-tree.js";

/**
 * Calculates the maximum end date for a booking period based on start date and maximum period.
 * Follows Koha circulation behavior where the start date counts as day 1.
 *
 * Example: issuelength=30, start=Feb 20 → end=March 21 (day 1 through day 30)
 *
 * @param {Date|string|import('dayjs').Dayjs} startDate - The start date
 * @param {number} maxPeriod - Maximum period in days (from circulation rules)
 * @returns {import('dayjs').Dayjs} The maximum end date
 */
export function calculateMaxEndDate(startDate, maxPeriod) {
    if (!maxPeriod || maxPeriod <= 0) {
        throw new Error("maxPeriod must be a positive number");
    }

    const start = BookingDate.from(startDate).toDayjs();
    // Start date is day 1, so end = start + (maxPeriod - 1)
    return start.add(maxPeriod - 1, "day");
}

/**
 * Optimized lead period validation using range queries instead of individual point queries
 * @param {import("dayjs").Dayjs} startDate - Potential start date to validate
 * @param {number} leadDays - Number of lead period days to check
 * @param {Object} intervalTree - Interval tree for conflict checking
 * @param {string|null} selectedItem - Selected item ID or null
 * @param {number|null} editBookingId - Booking ID being edited
 * @param {Array} allItemIds - All available item IDs
 * @returns {boolean} True if start date should be blocked due to lead period conflicts
 */
export function validateLeadPeriodOptimized(
    startDate,
    leadDays,
    intervalTree,
    selectedItem,
    editBookingId,
    allItemIds
) {
    if (leadDays <= 0) return false;

    const leadStart = startDate.subtract(leadDays, "day");
    const leadEnd = startDate.subtract(1, "day");

    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);
    const result = queryRangeAndResolve(
        intervalTree,
        leadStart.valueOf(),
        leadEnd.valueOf(),
        ctx
    );

    return result.hasConflict;
}

/**
 * Optimized trail period validation using range queries instead of individual point queries
 * @param {import("dayjs").Dayjs} endDate - Potential end date to validate
 * @param {number} trailDays - Number of trail period days to check
 * @param {Object} intervalTree - Interval tree for conflict checking
 * @param {string|null} selectedItem - Selected item ID or null
 * @param {number|null} editBookingId - Booking ID being edited
 * @param {Array} allItemIds - All available item IDs
 * @returns {boolean} True if end date should be blocked due to trail period conflicts
 */
export function validateTrailPeriodOptimized(
    endDate,
    trailDays,
    intervalTree,
    selectedItem,
    editBookingId,
    allItemIds
) {
    if (trailDays <= 0) return false;

    const trailStart = endDate.add(1, "day");
    const trailEnd = endDate.add(trailDays, "day");

    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);
    const result = queryRangeAndResolve(
        intervalTree,
        trailStart.valueOf(),
        trailEnd.valueOf(),
        ctx
    );

    return result.hasConflict;
}

/**
 * Validate if a booking range [startDate, endDate] would conflict with all available items.
 * This mirrors the backend's BETWEEN-based overlap detection.
 *
 * @param {import("dayjs").Dayjs} startDate - Start date of the potential booking
 * @param {import("dayjs").Dayjs} endDate - End date to validate
 * @param {Object} intervalTree - Interval tree for conflict checking
 * @param {string|null} selectedItem - Selected item ID or null for "any item"
 * @param {number|null} editBookingId - Booking ID being edited (to exclude)
 * @param {Array} allItemIds - All available item IDs
 * @returns {boolean} True if end date should be blocked due to range overlap conflicts
 */
export function validateRangeOverlapForEndDate(
    startDate,
    endDate,
    intervalTree,
    selectedItem,
    editBookingId,
    allItemIds
) {
    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);
    const result = queryRangeAndResolve(
        intervalTree,
        startDate.valueOf(),
        endDate.valueOf(),
        ctx
    );

    return result.hasConflict;
}

/**
 * Get items available for the entire specified period (no booking/checkout conflicts).
 * Used for "any item" mode payload construction at submission time to implement
 * upstream's 3-way logic: 0 available → error, 1 → auto-assign, 2+ → send itemtype_id.
 *
 * @param {string} startDate - ISO start date
 * @param {string} endDate - ISO end date
 * @param {Array} bookableItems - Constrained bookable items to check
 * @param {Array} bookings - All bookings for the biblio
 * @param {Array} checkouts - All checkouts for the biblio
 * @param {Object} circulationRules - Circulation rules (for interval tree construction)
 * @param {number|string|null} editBookingId - Booking being edited (excluded from conflicts)
 * @returns {Array} Items available for the entire period
 */
export function getAvailableItemsForPeriod(
    startDate,
    endDate,
    bookableItems,
    bookings,
    checkouts,
    circulationRules,
    editBookingId
) {
    const tree = buildIntervalTree(bookings, checkouts, circulationRules);
    const startTs = BookingDate.from(startDate)
        .toDayjs()
        .startOf("day")
        .valueOf();
    const endTs = BookingDate.from(endDate).toDayjs().startOf("day").valueOf();
    const normalizedEditId =
        editBookingId != null ? Number(editBookingId) : null;

    return bookableItems.filter(item => {
        const itemId = String(item.item_id);
        const conflicts = tree
            .queryRange(startTs, endTs, itemId)
            .filter(
                c =>
                    !normalizedEditId ||
                    c.metadata.booking_id != normalizedEditId
            )
            .filter(c => c.type === "booking" || c.type === "checkout");
        return conflicts.length === 0;
    });
}
