/**
 * Sweep line algorithm for computing per-day item unavailability.
 *
 * Sorts interval start/end events, then sweeps day-by-day to build
 * a map of which items are unavailable (and why) on each date.
 * Runs in O(n log n + d) where n = intervals, d = days in range.
 */

import { BookingDate, startOfDayTs, endOfDayTs } from "../BookingDate.js";

/**
 * @readonly
 * @enum {string}
 */
export const EventType = {
    START: "start",
    END: "end",
};

/**
 * @class SweepEvent
 * @private
 */
class SweepEvent {
    /**
     * @param {number} timestamp
     * @param {'start'|'end'} type
     * @param {import('./interval-tree.js').BookingInterval} interval
     */
    constructor(timestamp, type, interval) {
        /** @type {number} */
        this.timestamp = timestamp;
        /** @type {'start'|'end'} */
        this.type = type;
        /** @type {import('./interval-tree.js').BookingInterval} */
        this.interval = interval;
    }
}

/**
 * Sweep line processor for computing unavailability across a date range.
 *
 * @class SweepLineProcessor
 */
export class SweepLineProcessor {
    /**
     * Create a new sweep line processor
     */
    constructor() {
        /** @type {SweepEvent[]} Array of sweep events */
        this.events = [];
    }

    /**
     * Process intervals to generate unavailability data for a date range
     * @param {import('./interval-tree.js').BookingInterval[]} intervals - All booking/checkout intervals
     * @param {Date|import("dayjs").Dayjs} viewStart - Start of the visible date range
     * @param {Date|import("dayjs").Dayjs} viewEnd - End of the visible date range
     * @param {Array<string>} allItemIds - All bookable item IDs
     * @returns {Object<string, Object<string, Set<string>>>} unavailableByDate map
     */
    processIntervals(intervals, viewStart, viewEnd, allItemIds) {
        const startTimestamp = startOfDayTs(viewStart);
        const endTimestamp = endOfDayTs(viewEnd);

        this.events = [];
        intervals.forEach(interval => {
            if (
                interval.end < startTimestamp ||
                interval.start > endTimestamp
            ) {
                return;
            }

            const clampedStart = Math.max(interval.start, startTimestamp);
            const nextDayStart = BookingDate.from(interval.end)
                .addDays(1)
                .valueOf();
            const endRemovalTs = Math.min(nextDayStart, endTimestamp + 1);

            this.events.push(new SweepEvent(clampedStart, "start", interval));
            this.events.push(new SweepEvent(endRemovalTs, "end", interval));
        });

        this.events.sort((a, b) => {
            if (a.timestamp !== b.timestamp) {
                return a.timestamp - b.timestamp;
            }
            return a.type === "start" ? -1 : 1;
        });

        /** @type {Record<string, Record<string, Set<string>>>} */
        const unavailableByDate = {};
        const activeIntervals = new Map(); // itemId -> Set of intervals

        allItemIds.forEach(itemId => {
            activeIntervals.set(itemId, new Set());
        });

        let eventIndex = 0;

        for (
            let date = BookingDate.from(viewStart).toDayjs();
            date.isSameOrBefore(viewEnd, "day");
            date = date.add(1, "day")
        ) {
            const dateKey = date.format("YYYY-MM-DD");
            const dateStart = date.valueOf();
            const dateEnd = date.endOf("day").valueOf();

            while (
                eventIndex < this.events.length &&
                this.events[eventIndex].timestamp <= dateEnd
            ) {
                const event = this.events[eventIndex];
                const itemId = event.interval.itemId;

                if (event.type === EventType.START) {
                    if (!activeIntervals.has(itemId)) {
                        activeIntervals.set(itemId, new Set());
                    }
                    activeIntervals.get(itemId).add(event.interval);
                } else {
                    if (activeIntervals.has(itemId)) {
                        activeIntervals.get(itemId).delete(event.interval);
                    }
                }

                eventIndex++;
            }

            unavailableByDate[dateKey] = {};

            activeIntervals.forEach((intervals, itemId) => {
                const reasons = new Set();

                intervals.forEach(interval => {
                    if (
                        interval.start <= dateEnd &&
                        interval.end >= dateStart
                    ) {
                        if (interval.type === "booking") {
                            reasons.add("core");
                        } else if (interval.type === "checkout") {
                            reasons.add("checkout");
                        } else {
                            reasons.add(interval.type); // 'lead' or 'trail'
                        }
                    }
                });

                if (reasons.size > 0) {
                    unavailableByDate[dateKey][itemId] = reasons;
                }
            });
        }

        return unavailableByDate;
    }
}
