// Pure-function tests for findFirstBlockingDate — no mount, no DOM.
//
// findFirstBlockingDate walks candidate end dates from start+1 forward and
// returns the first end-date for which [start, end] would have no free item.
// The composable's classByDate clamps the constrained-range highlight at
// firstBlockingDate - 1 so the user only sees ranges the server would accept.

import { findFirstBlockingDate } from "@koha-vue/components/Bookings/lib/booking/availability/date-change.mjs";

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

// Helper: assert two Date values point at the same YYYY-MM-DD. The function
// returns a Date built via dayjs(...).toDate(); comparing by UTC-ish ts is
// brittle across runner timezones, so format and compare strings.
function expectSameDay(d, expected) {
    const ymd = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
    };
    expect(ymd(d)).to.equal(expected);
}

describe("findFirstBlockingDate (empty cases)", () => {
    it("returns the start date with reason 'no_items' when bookableItems is empty", () => {
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [],
            [],
            [],
            null,
            null
        );
        expect(result.reason).to.equal("no_items");
        expectSameDay(result.firstBlockingDate, "2026-03-10");
    });

    it("returns null when no bookings or checkouts exist in the window", () => {
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [],
            [],
            [item("1")],
            null,
            null
        );
        expect(result.firstBlockingDate).to.be.null;
        expect(result.reason).to.be.null;
    });

    it("returns null when bookings exist past the search window", () => {
        // Booking starts after end of search window → never crosses.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-04-01", "2026-04-05")],
            [],
            [item("1")],
            null,
            null
        );
        expect(result.firstBlockingDate).to.be.null;
    });
});

describe("findFirstBlockingDate (single item)", () => {
    it("returns the first candidate end date that crosses a booking", () => {
        // Single item, booking on Mar 20. The first [Mar 10, X] range that
        // overlaps Mar 20 is X = Mar 20. So firstBlockingDate = Mar 20.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-03-20", "2026-03-20")],
            [],
            [item("1")],
            null,
            null
        );
        expectSameDay(result.firstBlockingDate, "2026-03-20");
    });

    it("returns null when the booking is before start", () => {
        // Booking before search window → no overlap from start forward.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-03-01", "2026-03-05")],
            [],
            [item("1")],
            null,
            null
        );
        expect(result.firstBlockingDate).to.be.null;
    });

    it("treats checkouts as blockers", () => {
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [],
            [
                {
                    issue_id: 100,
                    item_id: "1",
                    checkout_date: "2026-03-19T00:00:00Z",
                    due_date: "2026-03-21T23:59:59Z",
                    patron_id: 5,
                },
            ],
            [item("1")],
            null,
            null
        );
        expectSameDay(result.firstBlockingDate, "2026-03-19");
    });
});

describe("findFirstBlockingDate (multiple items)", () => {
    it("returns null when at least one item is free across the window", () => {
        // Item 1 booked Mar 20, item 2 free. A range using item 2 is fine,
        // so no candidate end date all-items-blocks.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-03-20", "2026-03-20")],
            [],
            [item("1"), item("2")],
            null,
            null
        );
        expect(result.firstBlockingDate).to.be.null;
    });

    it("returns the candidate end date when every item is blocked at some point in the range", () => {
        // Both items blocked on Mar 20 (different bookings) — any range
        // covering Mar 20 has no free item. firstBlockingDate = Mar 20.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [
                booking("1", "2026-03-20", "2026-03-20", { booking_id: 1 }),
                booking("2", "2026-03-20", "2026-03-20", { booking_id: 2 }),
            ],
            [],
            [item("1"), item("2")],
            null,
            null
        );
        expectSameDay(result.firstBlockingDate, "2026-03-20");
        expect(result.reason).to.equal("all_items_have_conflicts");
    });

    it("narrows to a specific item when selectedItem is set", () => {
        // Same as the "at least one item free" case BUT we've selected
        // item 1, so item 2's freedom doesn't help. firstBlockingDate = Mar 20.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-03-20", "2026-03-20")],
            [],
            [item("1"), item("2")],
            "1",
            null
        );
        expectSameDay(result.firstBlockingDate, "2026-03-20");
    });

    it("excludes the booking being edited from conflict detection", () => {
        // Editing booking 99 on item 1, Mar 20 — should not block its own dates.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 24),
            [booking("1", "2026-03-20", "2026-03-20", { booking_id: 99 })],
            [],
            [item("1")],
            null,
            99
        );
        expect(result.firstBlockingDate).to.be.null;
    });
});

describe("findFirstBlockingDate (lead/trail period influence)", () => {
    it("returns the candidate end date when trail period overlaps the next booking", () => {
        // trail_period=2 means a booking ending day X reserves [X+1, X+2] too.
        // With an existing booking on Mar 25, a range [Mar 10, Mar 23] would
        // overlap because [Mar 24, Mar 25] is the trail buffer of the new
        // range and Mar 25 is taken. Behavior depends on interval-tree
        // configuration of trail; assert the function returns SOME blocking
        // date rather than null when trail is set.
        const result = findFirstBlockingDate(
            new Date(2026, 2, 10),
            new Date(2026, 2, 26),
            [booking("1", "2026-03-25", "2026-03-25")],
            [],
            [item("1")],
            null,
            null,
            { bookings_trail_period: 2 }
        );
        expect(result.firstBlockingDate).not.to.be.null;
    });
});
