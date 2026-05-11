/**
 * Date change handlers for booking availability.
 * @module availability/date-change
 */

import { BookingDate } from "../BookingDate.js";
import { buildIntervalTree } from "../algorithms/interval-tree.js";
import {
    queryRangeAndResolve,
    createConflictContext,
} from "../conflict-resolution.js";

/**
 * Find the first date where a booking range [startDate, candidateEnd] would conflict
 * with all items. This mirrors the backend's range-overlap detection logic.
 *
 * The backend considers two bookings overlapping if:
 * - existing.start_date BETWEEN new.start AND new.end (inclusive)
 * - existing.end_date BETWEEN new.start AND new.end (inclusive)
 * - existing completely wraps new
 *
 * @param {Date|import('dayjs').Dayjs} startDate - Start of the booking range
 * @param {Date|import('dayjs').Dayjs} endDate - Maximum end date to check
 * @param {Array} bookings - Array of booking objects
 * @param {Array} checkouts - Array of checkout objects
 * @param {Array} bookableItems - Array of bookable items
 * @param {string|number|null} selectedItem - Selected item ID or null for "any item"
 * @param {string|number|null} editBookingId - Booking ID being edited (to exclude)
 * @param {Object} circulationRules - Circulation rules for lead/trail periods
 * @returns {{ firstBlockingDate: Date|null, reason: string|null }} The first date that would cause all items to conflict
 */
export function findFirstBlockingDate(
    startDate,
    endDate,
    bookings,
    checkouts,
    bookableItems,
    selectedItem,
    editBookingId,
    circulationRules = {}
) {
    if (!bookableItems || bookableItems.length === 0) {
        return {
            firstBlockingDate: BookingDate.from(startDate).toDate(),
            reason: "no_items",
        };
    }

    const intervalTree = buildIntervalTree(
        bookings,
        checkouts,
        circulationRules
    );
    const allItemIds = bookableItems.map(i => String(i.item_id));
    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);

    const start = BookingDate.from(startDate).toDayjs();
    const end = BookingDate.from(endDate).toDayjs();

    // For each potential end date, check if the range [start, candidateEnd] would have at least one available item
    for (
        let candidateEnd = start.add(1, "day");
        candidateEnd.isSameOrBefore(end, "day");
        candidateEnd = candidateEnd.add(1, "day")
    ) {
        const result = queryRangeAndResolve(
            intervalTree,
            start.valueOf(),
            candidateEnd.valueOf(),
            ctx
        );

        if (result.hasConflict) {
            return {
                firstBlockingDate: candidateEnd.toDate(),
                reason: ctx.selectedItem
                    ? result.conflicts[0]?.type || "conflict"
                    : "all_items_have_conflicts",
            };
        }
    }

    return { firstBlockingDate: null, reason: null };
}
