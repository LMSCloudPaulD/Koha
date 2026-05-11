// Pure-function tests for buildUnavailableByDateMap and addHolidayMarkers.
//
// The unavailable map is the per-date conflict ledger the composable's
// markersByDate consumes. Each date maps to { item_id -> Set<reason> }
// where reasons include "booking", "checkout", "holiday", and "lead".
// A regression in this map cascades to the calendar UI (wrong markers,
// false negatives in availability counts).

import {
    buildUnavailableByDateMap,
    addHolidayMarkers,
} from "@koha-vue/components/Bookings/lib/booking/availability/unavailable-map.js";
import { buildIntervalTree } from "@koha-vue/components/Bookings/lib/booking/algorithms/interval-tree.js";
import { BookingDate } from "@koha-vue/components/Bookings/lib/booking/BookingDate.js";

const TODAY = BookingDate.from(new Date(2026, 2, 15)).toDayjs();

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

describe("buildUnavailableByDateMap (empty cases)", () => {
    it("returns an empty object when intervalTree is empty", () => {
        const tree = buildIntervalTree([], [], {});
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], null);
        expect(map).to.deep.equal({});
    });

    it("returns an empty object when intervalTree is null", () => {
        const map = buildUnavailableByDateMap(null, TODAY, ["1"], null);
        expect(map).to.deep.equal({});
    });
});

describe("buildUnavailableByDateMap (booking and checkout entries)", () => {
    it("marks a booked date with the 'booking' reason on the right item", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-20", "2026-03-22")],
            [],
            {}
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1", "2"], null);
        // Mar 20-22 should carry "booking" for item "1" (not item "2").
        expect(map["2026-03-20"]).to.have.property("1");
        expect([...map["2026-03-20"]["1"]]).to.include("booking");
        expect([...map["2026-03-21"]["1"]]).to.include("booking");
        expect([...map["2026-03-22"]["1"]]).to.include("booking");
        // Item 2 is not booked.
        if (map["2026-03-20"]["2"]) {
            expect([...map["2026-03-20"]["2"]]).not.to.include("booking");
        }
    });

    it("marks a checked-out date with the 'checkout' reason", () => {
        const tree = buildIntervalTree(
            [],
            [checkout("1", "2026-03-19", "2026-03-21")],
            {}
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], null);
        expect([...map["2026-03-19"]["1"]]).to.include("checkout");
        expect([...map["2026-03-21"]["1"]]).to.include("checkout");
    });

    it("excludes the booking being edited from the map", () => {
        const tree = buildIntervalTree(
            [booking("1", "2026-03-20", "2026-03-22", { booking_id: 99 })],
            [],
            {}
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], 99);
        // Date entry exists (every day in range is keyed) but item should
        // not carry a "booking" reason.
        const entry = map["2026-03-20"]?.["1"];
        if (entry) {
            expect([...entry]).not.to.include("booking");
        }
    });

    it("includes a lead period as a separate 'lead' reason on the right days", () => {
        // bookings_lead_period=2 + booking on Mar 20: lead spans Mar 18-19.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-20", "2026-03-20")],
            [],
            { bookings_lead_period: 2 }
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], null);
        expect([...map["2026-03-18"]["1"]]).to.include("lead");
        expect([...map["2026-03-19"]["1"]]).to.include("lead");
        expect([...map["2026-03-20"]["1"]]).to.include("booking");
    });

    it("includes a trail period as a separate 'trail' reason on the right days", () => {
        // bookings_trail_period=2 + booking on Mar 20: trail spans Mar 21-22.
        const tree = buildIntervalTree(
            [booking("1", "2026-03-20", "2026-03-20")],
            [],
            { bookings_trail_period: 2 }
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], null);
        expect([...map["2026-03-20"]["1"]]).to.include("booking");
        expect([...map["2026-03-21"]["1"]]).to.include("trail");
        expect([...map["2026-03-22"]["1"]]).to.include("trail");
    });
});

describe("buildUnavailableByDateMap (onDemand visible range)", () => {
    it("clips the map to the visibleStartDate/visibleEndDate window", () => {
        // Tree contains a booking far in the future. With onDemand and a
        // March 2026 window, that booking should NOT appear in the map.
        const tree = buildIntervalTree(
            [booking("1", "2027-01-01", "2027-01-05")],
            [],
            {}
        );
        const map = buildUnavailableByDateMap(tree, TODAY, ["1"], null, {
            onDemand: true,
            visibleStartDate: BookingDate.from(new Date(2026, 2, 1)).toDayjs(),
            visibleEndDate: BookingDate.from(new Date(2026, 2, 31)).toDayjs(),
        });
        // No entry for any 2027 date.
        Object.keys(map).forEach(key => {
            expect(key.startsWith("2027")).to.be.false;
        });
    });
});

describe("addHolidayMarkers", () => {
    it("adds a 'holiday' reason to every item on each holiday date", () => {
        const map = {};
        addHolidayMarkers(map, ["2026-03-20", "2026-03-21"], ["1", "2"]);
        expect([...map["2026-03-20"]["1"]]).to.include("holiday");
        expect([...map["2026-03-20"]["2"]]).to.include("holiday");
        expect([...map["2026-03-21"]["1"]]).to.include("holiday");
    });

    it("merges with an existing entry without overwriting other reasons", () => {
        const map = {
            "2026-03-20": {
                "1": new Set(["booking"]),
            },
        };
        addHolidayMarkers(map, ["2026-03-20"], ["1", "2"]);
        const reasons = [...map["2026-03-20"]["1"]];
        expect(reasons).to.include("booking");
        expect(reasons).to.include("holiday");
        // Item 2 gets a fresh entry.
        expect([...map["2026-03-20"]["2"]]).to.deep.equal(["holiday"]);
    });

    it("is a no-op when holidays is empty", () => {
        const map = {};
        addHolidayMarkers(map, [], ["1"]);
        expect(map).to.deep.equal({});
    });

    it("is a no-op when allItemIds is empty", () => {
        const map = {};
        addHolidayMarkers(map, ["2026-03-20"], []);
        expect(map).to.deep.equal({});
    });
});
