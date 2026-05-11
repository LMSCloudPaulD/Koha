/**
 * Unavailable date map builders for booking availability.
 * @module availability/unavailable-map
 */

import { BookingDate, addDays, subDays } from "../BookingDate.mjs";
import { SweepLineProcessor } from "../algorithms/sweep-line-processor.mjs";
import {
    CALENDAR_BUFFER_DAYS,
    DEFAULT_LOOKAHEAD_DAYS,
    MAX_SEARCH_DAYS,
} from "../constants.mjs";

/**
 * Build unavailableByDate map from IntervalTree for backward compatibility
 * @param {import('../algorithms/interval-tree.mjs').IntervalTree} intervalTree - The interval tree containing all bookings/checkouts
 * @param {import('dayjs').Dayjs} today - Today's date for range calculation
 * @param {Array} allItemIds - Array of all item IDs
 * @param {number|string|null} editBookingId - The booking_id being edited (exclude from results)
 * @param {import('../../../types/bookings').ConstraintOptions} options - Additional options for optimization
 * @returns {import('../../../types/bookings').UnavailableByDate}
 */
export function buildUnavailableByDateMap(
    intervalTree,
    today,
    allItemIds,
    editBookingId,
    options = {}
) {
    /** @type {import('../../../types/bookings').UnavailableByDate} */
    const unavailableByDate = {};

    if (!intervalTree || intervalTree.size === 0) {
        return unavailableByDate;
    }

    let startDate, endDate;
    if (
        options.onDemand &&
        options.visibleStartDate &&
        options.visibleEndDate
    ) {
        startDate = subDays(options.visibleStartDate, CALENDAR_BUFFER_DAYS);
        endDate = addDays(options.visibleEndDate, CALENDAR_BUFFER_DAYS);
    } else {
        startDate = subDays(today, CALENDAR_BUFFER_DAYS);
        endDate = addDays(today, DEFAULT_LOOKAHEAD_DAYS);
    }

    const rangeIntervals = intervalTree.queryRange(
        startDate.toDate(),
        endDate.toDate()
    );

    // Exclude the booking being edited
    const relevantIntervals = editBookingId
        ? rangeIntervals.filter(
              interval => interval.metadata?.booking_id != editBookingId
          )
        : rangeIntervals;

    const processor = new SweepLineProcessor();
    const sweptMap = processor.processIntervals(
        relevantIntervals,
        startDate.toDate(),
        endDate.toDate(),
        allItemIds
    );

    // Ensure the map contains all dates in the requested range, even if empty
    const filledMap = sweptMap && typeof sweptMap === "object" ? sweptMap : {};
    for (
        let d = startDate.clone();
        d.isSameOrBefore(endDate, "day");
        d = d.add(1, "day")
    ) {
        const key = d.format("YYYY-MM-DD");
        if (!filledMap[key]) filledMap[key] = {};
    }

    // Normalize reasons for legacy API expectations: convert 'core' -> 'booking'
    Object.keys(filledMap).forEach(dateKey => {
        const byItem = filledMap[dateKey];
        Object.keys(byItem).forEach(itemId => {
            const original = byItem[itemId];
            if (original && original instanceof Set) {
                const mapped = new Set();
                original.forEach(reason => {
                    mapped.add(reason === "core" ? "booking" : reason);
                });
                byItem[itemId] = mapped;
            }
        });
    });

    return filledMap;
}

/**
 * Add holiday markers for dates that are library closed days.
 * This ensures visual highlighting for closed days in the calendar.
 *
 * @param {import('../../../types/bookings').UnavailableByDate} unavailableByDate - The map to modify
 * @param {Array<string>} holidays - Array of holiday dates in YYYY-MM-DD format
 * @param {Array<string>} allItemIds - Array of all item IDs
 */
export function addHolidayMarkers(unavailableByDate, holidays, allItemIds) {
    if (
        !holidays ||
        holidays.length === 0 ||
        !allItemIds ||
        allItemIds.length === 0
    ) {
        return;
    }

    holidays.forEach(dateStr => {
        if (!unavailableByDate[dateStr]) {
            unavailableByDate[dateStr] = {};
        }

        allItemIds.forEach(itemId => {
            if (!unavailableByDate[dateStr][itemId]) {
                unavailableByDate[dateStr][itemId] = new Set();
            }
            unavailableByDate[dateStr][itemId].add("holiday");
        });
    });
}

/**
 * Add lead period markers for dates within the lead period from today.
 * This ensures visual highlighting when a lead period is configured.
 *
 * @param {import('../../../types/bookings').UnavailableByDate} unavailableByDate - The map to modify
 * @param {import('dayjs').Dayjs} today - Today's date
 * @param {number} leadDays - Number of lead period days
 * @param {Array<string>} allItemIds - Array of all item IDs
 */
export function addLeadPeriodFromTodayMarkers(
    unavailableByDate,
    today,
    leadDays,
    allItemIds
) {
    if (leadDays <= 0 || !allItemIds || allItemIds.length === 0) return;

    // Tag dates from today to today + leadDays - 1 with "lead-floor".
    // Distinct from the "lead" reason emitted by the interval tree for
    // existing bookings' lead windows: this one is the minimum-advance
    // floor before any new booking can start, not the lead of an
    // existing booking. Consumers (hover feedback) rely on the
    // distinction to render an accurate message.
    for (let i = 0; i < leadDays; i++) {
        const date = today.add(i, "day");
        const key = date.format("YYYY-MM-DD");

        if (!unavailableByDate[key]) {
            unavailableByDate[key] = {};
        }

        allItemIds.forEach(itemId => {
            const existing = unavailableByDate[key][itemId];
            if (existing && (existing.has("booking") || existing.has("checkout"))) {
                return;
            }
            if (!existing) {
                unavailableByDate[key][itemId] = new Set();
            }
            unavailableByDate[key][itemId].add("lead-floor");
        });
    }
}

/**
 * Add lead period markers for dates after trail periods where the lead period
 * would overlap with the trail. This ensures visual highlighting for the
 * theoretical lead period after existing bookings.
 *
 * @param {import('../../../types/bookings').UnavailableByDate} unavailableByDate - The map to modify
 * @param {import('../algorithms/interval-tree.mjs').IntervalTree} intervalTree - The interval tree with all bookings/checkouts
 * @param {import('dayjs').Dayjs} today - Today's date
 * @param {number} leadDays - Number of lead period days
 * @param {number|null} editBookingId - Booking ID being edited (to exclude)
 */
export function addTheoreticalLeadPeriodMarkers(
    unavailableByDate,
    intervalTree,
    today,
    leadDays,
    editBookingId
) {
    if (leadDays <= 0 || !intervalTree || intervalTree.size === 0) return;

    // Query all trail intervals in a reasonable range
    const rangeStart = today.subtract(CALENDAR_BUFFER_DAYS, "day");
    const rangeEnd = today.add(MAX_SEARCH_DAYS, "day");

    const allIntervals = intervalTree.queryRange(
        rangeStart.valueOf(),
        rangeEnd.valueOf()
    );

    // Filter to get only trail intervals
    const trailIntervals = allIntervals.filter(
        interval =>
            interval.type === "trail" &&
            (!editBookingId || interval.metadata?.booking_id != editBookingId)
    );

    trailIntervals.forEach(trailInterval => {
        // For each existing booking's trail, the lead period a hypothetical
        // follow-up booking would need is [trailEnd+1, trailEnd+leadDays].
        // Tag those dates as "lead-theoretical" to keep them distinct from
        // "lead" (the lead window of an actual existing booking) so hover
        // feedback can attribute the block accurately.
        const trailEnd = BookingDate.from(trailInterval.end).toDayjs();
        const itemId = trailInterval.itemId;

        for (let i = 1; i <= leadDays; i++) {
            const blockedDate = trailEnd.add(i, "day");
            if (blockedDate.isBefore(today, "day")) continue;

            const key = blockedDate.format("YYYY-MM-DD");

            if (!unavailableByDate[key]) {
                unavailableByDate[key] = {};
            }

            const existing = unavailableByDate[key][itemId];
            if (existing && (existing.has("booking") || existing.has("checkout"))) {
                continue;
            }

            if (!existing) {
                unavailableByDate[key][itemId] = new Set();
            }

            unavailableByDate[key][itemId].add("lead-theoretical");
        }
    });
}
