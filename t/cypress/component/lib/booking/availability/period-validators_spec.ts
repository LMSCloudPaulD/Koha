// Pure-function tests for the period validators.
//
// These helpers underpin createDisableFunction's lead/trail/maxPeriod
// branches and the composable's range-preview message. Tested directly
// here (no IntervalTree mock — buildIntervalTree is cheap on small
// fixtures) so a regression in one validator surfaces in this file alone.

import {
    calculateMaxEndDate,
    validateBookingPeriod,
    validateLeadPeriodOptimized,
    validateTrailPeriodOptimized,
    validateRangeOverlapForEndDate,
    getAvailableItemsForPeriod,
} from "@koha-vue/components/Bookings/lib/booking/availability/period-validators.js";
import { buildIntervalTree } from "@koha-vue/components/Bookings/lib/booking/algorithms/interval-tree.js";
import { BookingDate } from "@koha-vue/components/Bookings/lib/booking/BookingDate.js";

const item = id => ({
    item_id: id,
    title: `Item ${id}`,
    barcode: `bar-${id}`,
});

const booking = (item_id, start, end, extra) => ({
    booking_id: (extra && extra.booking_id) || 1,
    item_id,
    start_date: `${start}T00:00:00Z`,
    end_date: `${end}T23:59:59Z`,
    patron_id: 1,
    ...(extra || {}),
});

const dayjs = d => BookingDate.from(d).toDayjs();

describe("calculateMaxEndDate", () => {
    it("returns start + (maxPeriod - 1) so start counts as day 1", () => {
        // start=Mar 20, maxPeriod=5 → end=Mar 24 (Mar 20, 21, 22, 23, 24)
        const result = calculateMaxEndDate(new Date(2026, 2, 20), 5);
        expect(result.format("YYYY-MM-DD")).to.equal("2026-03-24");
    });

    it("returns the start day itself when maxPeriod is 1", () => {
        const result = calculateMaxEndDate(new Date(2026, 2, 20), 1);
        expect(result.format("YYYY-MM-DD")).to.equal("2026-03-20");
    });

    it("throws when maxPeriod is zero", () => {
        expect(() => calculateMaxEndDate(new Date(2026, 2, 20), 0)).to.throw(
            "maxPeriod must be a positive number"
        );
    });

    it("throws when maxPeriod is negative", () => {
        expect(() => calculateMaxEndDate(new Date(2026, 2, 20), -1)).to.throw(
            "maxPeriod must be a positive number"
        );
    });
});

describe("validateBookingPeriod", () => {
    it("returns true (valid) when there is no maxPeriod", () => {
        expect(
            validateBookingPeriod(
                new Date(2026, 2, 20),
                new Date(2027, 0, 1),
                0
            )
        ).to.be.true;
    });

    it("returns true when end == start + (maxPeriod - 1)", () => {
        // start=Mar 20, end=Mar 24, maxPeriod=5 → exactly at the limit.
        expect(
            validateBookingPeriod(
                new Date(2026, 2, 20),
                new Date(2026, 2, 24),
                5
            )
        ).to.be.true;
    });

    it("returns false when end exceeds the calculated max", () => {
        expect(
            validateBookingPeriod(
                new Date(2026, 2, 20),
                new Date(2026, 2, 25),
                5
            )
        ).to.be.false;
    });
});

describe("validateLeadPeriodOptimized", () => {
    it("returns false when leadDays is zero", () => {
        const tree = buildIntervalTree([], [], {});
        const result = validateLeadPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            0,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.false;
    });

    it("returns true when a booking conflicts inside the lead window", () => {
        // leadDays=3, start=Mar 20 → lead window [Mar 17, Mar 19].
        // A booking covering Mar 18 falls inside this window → conflict.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-18", "2026-03-18")],
            [],
            {}
        );
        const result = validateLeadPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            3,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.true;
    });

    it("returns false when no booking conflicts inside the lead window", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-10", "2026-03-10")],
            [],
            {}
        );
        const result = validateLeadPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            3,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.false;
    });
});

describe("validateTrailPeriodOptimized", () => {
    it("returns false when trailDays is zero", () => {
        const tree = buildIntervalTree([], [], {});
        const result = validateTrailPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            0,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.false;
    });

    it("returns true when a booking conflicts inside the trail window", () => {
        // trailDays=3, end=Mar 20 → trail window [Mar 21, Mar 23].
        // A booking on Mar 22 falls inside this window → conflict.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-22", "2026-03-22")],
            [],
            {}
        );
        const result = validateTrailPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            3,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.true;
    });

    it("returns false when no booking conflicts inside the trail window", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-28", "2026-03-28")],
            [],
            {}
        );
        const result = validateTrailPeriodOptimized(
            dayjs(new Date(2026, 2, 20)),
            3,
            tree,
            null,
            null,
            ["1"]
        );
        expect(result).to.be.false;
    });
});

describe("validateRangeOverlapForEndDate", () => {
    it("returns true when [start, end] crosses a booking on the selected item", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-22", "2026-03-22")],
            [],
            {}
        );
        const result = validateRangeOverlapForEndDate(
            dayjs(new Date(2026, 2, 20)),
            dayjs(new Date(2026, 2, 24)),
            tree,
            "1",
            null,
            ["1"]
        );
        expect(result).to.be.true;
    });

    it("returns false when at least one item is free across the range (no selected item)", () => {
        // Item 1 blocked Mar 22, item 2 free. Without selectedItem the
        // function reports no overall conflict.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-22", "2026-03-22")],
            [],
            {}
        );
        const result = validateRangeOverlapForEndDate(
            dayjs(new Date(2026, 2, 20)),
            dayjs(new Date(2026, 2, 24)),
            tree,
            null,
            null,
            ["1", "2"]
        );
        expect(result).to.be.false;
    });

    it("excludes the booking being edited from overlap detection", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-22", "2026-03-22", { booking_id: 99 })],
            [],
            {}
        );
        const result = validateRangeOverlapForEndDate(
            dayjs(new Date(2026, 2, 20)),
            dayjs(new Date(2026, 2, 24)),
            tree,
            "1",
            99,
            ["1"]
        );
        expect(result).to.be.false;
    });
});

describe("getAvailableItemsForPeriod", () => {
    it("returns all items when none are booked or checked out in the window", () => {
        const result = getAvailableItemsForPeriod(
            "2026-03-20",
            "2026-03-24",
            [item("1"), item("2")],
            [],
            [],
            {},
            null
        );
        expect(result.map(i => i.item_id)).to.deep.equal(["1", "2"]);
    });

    it("filters out items whose bookings overlap the window", () => {
        const result = getAvailableItemsForPeriod(
            "2026-03-20",
            "2026-03-24",
            [item("1"), item("2")],
            [booking("1", "2026-03-22", "2026-03-22")],
            [],
            {},
            null
        );
        expect(result.map(i => i.item_id)).to.deep.equal(["2"]);
    });

    it("filters out items whose checkouts overlap the window", () => {
        const result = getAvailableItemsForPeriod(
            "2026-03-20",
            "2026-03-24",
            [item("1"), item("2")],
            [],
            [
                {
                    issue_id: 100,
                    item_id: "1",
                    checkout_date: "2026-03-21T00:00:00Z",
                    due_date: "2026-03-23T23:59:59Z",
                    patron_id: 5,
                },
            ],
            {},
            null
        );
        expect(result.map(i => i.item_id)).to.deep.equal(["2"]);
    });

    it("includes an item whose only conflict is the booking being edited", () => {
        const result = getAvailableItemsForPeriod(
            "2026-03-20",
            "2026-03-24",
            [item("1")],
            [booking("1", "2026-03-22", "2026-03-22", { booking_id: 99 })],
            [],
            {},
            99
        );
        expect(result.map(i => i.item_id)).to.deep.equal(["1"]);
    });

    it("returns an empty array when every item conflicts in the window", () => {
        const result = getAvailableItemsForPeriod(
            "2026-03-20",
            "2026-03-24",
            [item("1"), item("2")],
            [
                booking("1", "2026-03-22", "2026-03-22", { booking_id: 1 }),
                booking("2", "2026-03-22", "2026-03-22", { booking_id: 2 }),
            ],
            [],
            {},
            null
        );
        expect(result).to.deep.equal([]);
    });
});
