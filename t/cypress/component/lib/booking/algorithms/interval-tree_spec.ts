// Pure-function tests for buildIntervalTree and IntervalTree.queryRange.
//
// The interval tree underpins every conflict check in the booking module:
// createDisableFunction queries it per-day, findFirstBlockingDate queries
// it per-range, and the composable's markersByDate consumes its outputs
// indirectly. A regression here cascades; pin the contract directly.

import {
    IntervalTree,
    BookingInterval,
    buildIntervalTree,
} from "@koha-vue/components/Bookings/lib/booking/algorithms/interval-tree.mjs";

const booking = (item_id, start, end, extra) => ({
    booking_id: (extra && extra.booking_id) || 1,
    item_id,
    start_date: `${start}T00:00:00Z`,
    end_date: `${end}T23:59:59Z`,
    patron_id: 1,
    ...(extra || {}),
});

const checkout = (item_id, start, due, extra) => ({
    issue_id: (extra && extra.issue_id) || 100,
    item_id,
    checkout_date: `${start}T00:00:00Z`,
    due_date: `${due}T23:59:59Z`,
    patron_id: 1,
    ...(extra || {}),
});

const day = (y, mZero, d) => new Date(y, mZero, d);

describe("buildIntervalTree (no extra periods)", () => {
    it("builds an empty tree from empty inputs", () => {
        const tree = buildIntervalTree([], [], {});
        expect(tree.size).to.equal(0);
        expect(
            tree.queryRange(day(2026, 2, 1), day(2026, 2, 31))
        ).to.deep.equal([]);
    });

    it("inserts one interval per booking", () => {
        const tree = buildIntervalTree(
            [
                booking("1", "2026-03-10", "2026-03-12"),
                booking("2", "2026-03-15", "2026-03-15", { booking_id: 2 }),
            ],
            [],
            {}
        );
        expect(tree.size).to.equal(2);
    });

    it("inserts one interval per checkout", () => {
        const tree = buildIntervalTree(
            [],
            [
                checkout("1", "2026-03-10", "2026-03-12"),
                checkout("2", "2026-03-15", "2026-03-15", { issue_id: 101 }),
            ],
            {}
        );
        expect(tree.size).to.equal(2);
    });

    it("skips bookings missing required fields", () => {
        const tree = buildIntervalTree(
            [
                booking("1", "2026-03-10", "2026-03-12"),
                { item_id: "2" }, // missing dates
                { start_date: "2026-03-10", end_date: "2026-03-12" }, // missing item_id
            ],
            [],
            {}
        );
        expect(tree.size).to.equal(1);
    });

    it("skips checkouts missing required fields", () => {
        const tree = buildIntervalTree(
            [],
            [checkout("1", "2026-03-10", "2026-03-12"), { item_id: "2" }],
            {}
        );
        expect(tree.size).to.equal(1);
    });
});

describe("buildIntervalTree (lead/trail periods)", () => {
    it("inserts a lead interval when bookings_lead_period > 0", () => {
        // lead=2, booking 2026-03-10..12 → lead interval 2026-03-08..09.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-10", "2026-03-12")],
            [],
            { bookings_lead_period: 2 }
        );
        // booking + lead = 2 intervals
        expect(tree.size).to.equal(2);
        // The lead interval should overlap a query on Mar 8-9
        const hits = tree.queryRange(day(2026, 2, 8), day(2026, 2, 9), "1");
        const leadHits = hits.filter(h => h.type === "lead");
        expect(leadHits.length).to.be.greaterThan(0);
    });

    it("inserts a trail interval when bookings_trail_period > 0", () => {
        // trail=2, booking 2026-03-10..12 → trail 2026-03-13..14.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-10", "2026-03-12")],
            [],
            { bookings_trail_period: 2 }
        );
        expect(tree.size).to.equal(2);
        const hits = tree.queryRange(day(2026, 2, 13), day(2026, 2, 14), "1");
        const trailHits = hits.filter(h => h.type === "trail");
        expect(trailHits.length).to.be.greaterThan(0);
    });

    it("inserts both lead and trail when both are set", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-10", "2026-03-12")],
            [],
            { bookings_lead_period: 1, bookings_trail_period: 1 }
        );
        expect(tree.size).to.equal(3); // booking + lead + trail
    });

    it("does not insert lead/trail for checkouts", () => {
        const tree = buildIntervalTree(
            [],
            [checkout("1", "2026-03-10", "2026-03-12")],
            { bookings_lead_period: 2, bookings_trail_period: 2 }
        );
        // Checkout has no lead/trail extension — only the checkout itself.
        expect(tree.size).to.equal(1);
    });
});

describe("IntervalTree.queryRange (overlap semantics)", () => {
    it("returns intervals that fully sit inside the query range", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-15", "2026-03-17")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 10), day(2026, 2, 20));
        expect(hits).to.have.length(1);
        expect(hits[0].itemId).to.equal("1");
    });

    it("returns intervals that overlap the query range's left edge", () => {
        // Booking spans Mar 12-16, query Mar 15-20 → overlap.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-12", "2026-03-16")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 20));
        expect(hits).to.have.length(1);
    });

    it("returns intervals that overlap the query range's right edge", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-18", "2026-03-22")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 20));
        expect(hits).to.have.length(1);
    });

    it("returns intervals that wholly contain the query range", () => {
        // Booking spans Mar 1-31, query Mar 15-17 → overlap.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-01", "2026-03-31")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 17));
        expect(hits).to.have.length(1);
    });

    it("excludes intervals entirely before the query range", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-02-01", "2026-02-05")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 20));
        expect(hits).to.have.length(0);
    });

    it("excludes intervals entirely after the query range", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-04-01", "2026-04-05")],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 20));
        expect(hits).to.have.length(0);
    });
});

describe("IntervalTree.queryRange (item-id filter)", () => {
    it("returns only intervals matching the itemId filter", () => {
        const tree = buildIntervalTree(
            [
                booking("1", "2026-03-15", "2026-03-17"),
                booking("2", "2026-03-15", "2026-03-17", { booking_id: 2 }),
                booking("3", "2026-03-15", "2026-03-17", { booking_id: 3 }),
            ],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 17), "2");
        expect(hits).to.have.length(1);
        expect(hits[0].itemId).to.equal("2");
    });

    it("returns all overlapping intervals when itemId is null", () => {
        const tree = buildIntervalTree(
            [
                booking("1", "2026-03-15", "2026-03-17"),
                booking("2", "2026-03-15", "2026-03-17", { booking_id: 2 }),
            ],
            [],
            {}
        );
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 17), null);
        expect(hits).to.have.length(2);
    });
});

describe("IntervalTree.removeWhere", () => {
    it("removes intervals matching the predicate and updates size", () => {
        const tree = buildIntervalTree(
            [
                booking("1", "2026-03-15", "2026-03-17"),
                booking("2", "2026-03-15", "2026-03-17", { booking_id: 2 }),
            ],
            [],
            {}
        );
        const removed = tree.removeWhere(iv => iv.itemId === "1");
        expect(removed).to.equal(1);
        expect(tree.size).to.equal(1);
        const hits = tree.queryRange(day(2026, 2, 15), day(2026, 2, 17));
        expect(hits.map(h => h.itemId)).to.deep.equal(["2"]);
    });
});

describe("BookingInterval constructor", () => {
    it("throws when start is after end", () => {
        expect(() => {
            new BookingInterval("2026-03-20", "2026-03-10", "1", "booking");
        }).to.throw("Invalid interval");
    });

    it("normalizes itemId to a string", () => {
        const iv = new BookingInterval(
            "2026-03-10",
            "2026-03-12",
            42,
            "booking"
        );
        expect(iv.itemId).to.equal("42");
    });

    it("containsDate is inclusive at both bounds", () => {
        const iv = new BookingInterval(
            "2026-03-10",
            "2026-03-12",
            "1",
            "booking"
        );
        expect(iv.containsDate(new Date(2026, 2, 10))).to.be.true;
        expect(iv.containsDate(new Date(2026, 2, 12))).to.be.true;
        expect(iv.containsDate(new Date(2026, 2, 9))).to.be.false;
        expect(iv.containsDate(new Date(2026, 2, 13))).to.be.false;
    });
});

describe("IntervalTree (empty edge cases)", () => {
    it("returns an empty array when querying an empty tree", () => {
        const tree = new IntervalTree();
        expect(
            tree.queryRange(day(2026, 2, 1), day(2026, 2, 31))
        ).to.deep.equal([]);
    });

    it("size starts at zero", () => {
        const tree = new IntervalTree();
        expect(tree.size).to.equal(0);
    });
});
