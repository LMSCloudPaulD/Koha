// Pure-function tests for createDisableFunction — no mount, no DOM.
//
// createDisableFunction is the predicate the composable's disabledFn wraps,
// the same one flatpickr ultimately calls per day. Test it in isolation here
// against fixture inputs (intervalTree + config built via the real helpers
// from plain bookings/checkouts arrays) so a regression points directly at
// the algorithm, not at a DOM or store layer.

import { createDisableFunction } from "@koha-vue/components/Bookings/lib/booking/availability/disabled-dates.mjs";
import { buildIntervalTree } from "@koha-vue/components/Bookings/lib/booking/algorithms/interval-tree.mjs";
import { extractBookingConfiguration } from "@koha-vue/components/Bookings/lib/booking/availability/rules.mjs";

// Deterministic "today" for every test in this file: March 15, 2026.
// All fixtures are relative to this anchor so the past-date guard, lead-
// period math, and isoformat boundaries don't drift across runs.
const TODAY = new Date(2026, 2, 15);

const item = id => ({
    item_id: id,
    title: `Item ${id}`,
    barcode: `bar-${id}`,
});

function makeDisableFn(opts) {
    opts = opts || {};
    const bookings = opts.bookings || [];
    const checkouts = opts.checkouts || [];
    const bookableItems = opts.bookableItems || [item("1")];
    const rules = opts.rules || {};
    const selectedItem = opts.selectedItem != null ? opts.selectedItem : null;
    const editBookingId =
        opts.editBookingId != null ? opts.editBookingId : null;
    const selectedDates = opts.selectedDates || [];
    const holidays = opts.holidays || [];

    const intervalTree = buildIntervalTree(bookings, checkouts, rules);
    const config = extractBookingConfiguration(rules, TODAY);
    return createDisableFunction(
        intervalTree,
        config,
        bookableItems,
        selectedItem,
        editBookingId,
        selectedDates,
        holidays
    );
}

const booking = (item_id, start, end, extra) => ({
    booking_id: (extra && extra.booking_id) || 1,
    item_id,
    start_date: `${start}T00:00:00Z`,
    end_date: `${end}T23:59:59Z`,
    patron_id: 1,
    ...(extra || {}),
});

describe("createDisableFunction (past-date and presence guards)", () => {
    it("disables dates before today", () => {
        const fn = makeDisableFn();
        expect(fn(new Date(2026, 2, 14))).to.be.true; // Mar 14 (yesterday)
        expect(fn(new Date(2026, 1, 28))).to.be.true; // Feb 28
    });

    it("allows today itself", () => {
        const fn = makeDisableFn();
        expect(fn(new Date(2026, 2, 15))).to.be.false;
    });

    it("allows future dates with no constraints", () => {
        const fn = makeDisableFn();
        expect(fn(new Date(2026, 2, 16))).to.be.false;
        expect(fn(new Date(2026, 5, 1))).to.be.false;
    });

    it("disables every date when bookableItems is empty", () => {
        // No items to book against → every probe must be disabled regardless
        // of date. Past-date guard fires first for past dates, so this is
        // really asserting on the future-date branch.
        const fn = makeDisableFn({ bookableItems: [] });
        expect(fn(new Date(2026, 2, 16))).to.be.true;
        expect(fn(new Date(2026, 5, 1))).to.be.true;
    });
});

describe("createDisableFunction (holiday handling)", () => {
    it("disables holidays when no start date is selected", () => {
        // Picking a START date: holidays are hard-disabled. This is the
        // map-side rendering — the composable's disabledByDate surfaces it
        // with severity:'hard'.
        const fn = makeDisableFn({ holidays: ["2026-03-20"] });
        expect(fn(new Date(2026, 2, 20))).to.be.true;
    });

    it("allows holidays once a start date is selected (lets range cross them)", () => {
        // Picking an END date: holidays must NOT be disabled at the
        // flatpickr level, otherwise the range validator rejects spans that
        // cross them. Soft severity is applied separately by disabledByDate.
        const fn = makeDisableFn({
            holidays: ["2026-03-20"],
            selectedDates: [new Date(2026, 2, 18)],
        });
        expect(fn(new Date(2026, 2, 20))).to.be.false;
    });

    it("does not affect non-holiday dates", () => {
        const fn = makeDisableFn({ holidays: ["2026-03-20"] });
        expect(fn(new Date(2026, 2, 21))).to.be.false;
    });
});

describe("createDisableFunction (point conflicts with existing bookings)", () => {
    it("disables a date covered by an existing booking when one item exists", () => {
        const fn = makeDisableFn({
            bookings: [booking("1", "2026-03-20", "2026-03-22")],
        });
        expect(fn(new Date(2026, 2, 20))).to.be.true;
        expect(fn(new Date(2026, 2, 21))).to.be.true;
        expect(fn(new Date(2026, 2, 22))).to.be.true;
        expect(fn(new Date(2026, 2, 23))).to.be.false;
    });

    it("allows a date when at least one bookable item is still free", () => {
        // Only item 1 is booked; item 2 is free → not all-items-blocked.
        const fn = makeDisableFn({
            bookableItems: [item("1"), item("2")],
            bookings: [booking("1", "2026-03-20", "2026-03-22")],
        });
        expect(fn(new Date(2026, 2, 21))).to.be.false;
    });

    it("disables when the selected item specifically is booked", () => {
        // selectedItem narrows the disable check to that one item.
        const fn = makeDisableFn({
            bookableItems: [item("1"), item("2")],
            bookings: [booking("1", "2026-03-20", "2026-03-22")],
            selectedItem: "1",
        });
        expect(fn(new Date(2026, 2, 21))).to.be.true;
    });

    it("excludes the booking being edited from conflict detection", () => {
        // Editing booking 99 means its own dates must not block the calendar.
        const fn = makeDisableFn({
            bookings: [
                booking("1", "2026-03-20", "2026-03-22", { booking_id: 99 }),
            ],
            editBookingId: 99,
        });
        expect(fn(new Date(2026, 2, 21))).to.be.false;
    });
});

describe("createDisableFunction (lead period from today)", () => {
    it("disables dates inside the lead window when no start is selected", () => {
        // bookings_lead_period=3, today=Mar 15 → minStartDate = Mar 18.
        // Mar 16-17 are inside the lead window and must be disabled.
        const fn = makeDisableFn({
            rules: { bookings_lead_period: 3 },
        });
        expect(fn(new Date(2026, 2, 16))).to.be.true;
        expect(fn(new Date(2026, 2, 17))).to.be.true;
        expect(fn(new Date(2026, 2, 18))).to.be.false;
        expect(fn(new Date(2026, 2, 19))).to.be.false;
    });

    it("ignores lead period when no rule is set", () => {
        const fn = makeDisableFn();
        expect(fn(new Date(2026, 2, 16))).to.be.false;
        expect(fn(new Date(2026, 2, 17))).to.be.false;
    });

    it("blocks a candidate start that would overlap an existing booking's lead buffer", () => {
        // bookings_lead_period=3 with an existing booking starting Mar 25:
        // a new start at Mar 23 would put a lead-period overlap in the
        // [Mar 22, Mar 24] window, which validateLeadPeriodOptimized catches.
        const fn = makeDisableFn({
            rules: { bookings_lead_period: 3 },
            bookings: [booking("1", "2026-03-25", "2026-03-27")],
        });
        expect(fn(new Date(2026, 2, 23))).to.be.true;
    });
});

describe("createDisableFunction (end-date selection)", () => {
    it("disables an end date past anchor + maxPeriod - 1", () => {
        // anchor=Mar 20, maxPeriod=5 → calculatedEnd = anchor + 4 = Mar 24
        // (anchor counts as day 1; see calculateMaxEndDate). Mar 25 must
        // be disabled, Mar 24 allowed.
        const fn = makeDisableFn({
            rules: { issuelength: 5 },
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 24))).to.be.false;
        expect(fn(new Date(2026, 2, 25))).to.be.true;
    });

    it("disables an end date whose [start, end] range overlaps a booking", () => {
        // anchor=Mar 20, booking blocks Mar 25 → an end at Mar 26 would span
        // the conflict and must be rejected by validateRangeOverlapForEndDate.
        const fn = makeDisableFn({
            bookings: [booking("1", "2026-03-25", "2026-03-25")],
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 24))).to.be.false;
        expect(fn(new Date(2026, 2, 26))).to.be.true;
    });

    it("disables an end date whose trail period overlaps the next booking", () => {
        // trail_period=2, anchor=Mar 20, next booking Mar 27-29 → an end at
        // Mar 25 would put [Mar 26, Mar 27] inside the next booking's lead-
        // adjacent window, caught by validateTrailPeriodOptimized.
        const fn = makeDisableFn({
            rules: { bookings_trail_period: 2 },
            bookings: [booking("1", "2026-03-27", "2026-03-29")],
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 25))).to.be.true;
    });
});

describe("createDisableFunction (end-date-only mode)", () => {
    it("allows the calculated end date exactly at anchor + maxPeriod - 1", () => {
        // end_date_only with maxPeriod=5, anchor=Mar 20:
        // calculatedEnd=Mar 24 must be selectable (short-circuit at the
        // isEndDateOnly + isSame(calculatedEnd) check).
        const fn = makeDisableFn({
            rules: {
                booking_constraint_mode: "end_date_only",
                issuelength: 5,
            },
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 24))).to.be.false;
    });

    it("does not disable intermediate dates at the flatpickr level (soft handling owns UX)", () => {
        // end_date_only with maxPeriod=5, anchor=Mar 20:
        // intermediates Mar 21-23 stay enabled here so flatpickr's range
        // validator accepts [Mar 20, Mar 24]. The disabledByDate Map applies
        // soft severity for UI affordance instead.
        const fn = makeDisableFn({
            rules: {
                booking_constraint_mode: "end_date_only",
                issuelength: 5,
            },
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 21))).to.be.false;
        expect(fn(new Date(2026, 2, 23))).to.be.false;
    });

    it("disables dates past the calculated end even in end-date-only mode", () => {
        // anchor + maxPeriod - 1 = Mar 24, so Mar 25 must be disabled.
        const fn = makeDisableFn({
            rules: {
                booking_constraint_mode: "end_date_only",
                issuelength: 5,
            },
            selectedDates: [new Date(2026, 2, 20)],
        });
        expect(fn(new Date(2026, 2, 25))).to.be.true;
    });
});
