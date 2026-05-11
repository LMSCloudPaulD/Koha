import BaseFlatpickr from "@koha-vue/components/BaseFlatpickr.vue";
import { useBookingCalendarMaps } from "@koha-vue/components/Bookings/composables/useBookingCalendarMaps.mjs";
import { computed, toRefs } from "vue";

// This spec tests the composable's contract directly: given input refs,
// it returns Maps + computeds + a function. Most tests inspect those
// outputs via wrapper.vm without mounting BaseFlatpickr or flatpickr.
// Cross-checks against BaseFlatpickr's DOM behavior live in
// BaseFlatpickr_spec; algorithmic correctness of the underlying
// availability/* helpers lives in t/cypress/component/lib/booking/*.
// The remaining DOM smoke tests at the bottom of this file verify that
// the composable's outputs still slot into BaseFlatpickr cleanly.

const MARCH_2026 = { year: 2026, month: 2 };

const MARCH_RANGE = {
    start: new Date(2026, 2, 1),
    end: new Date(2026, 2, 31),
};

const item = id => ({
    item_id: id,
    title: `Item ${id}`,
    barcode: `bar-${id}`,
});

// Renderless host that wires the composable the same way production does
// (rangeAnchor + selectedDateRange derived from modelValue) and exposes
// every output for direct inspection. No BaseFlatpickr, no flatpickr.
const ComposableHost = {
    props: [
        "bookableItems",
        "bookings",
        "checkouts",
        "holidays",
        "editBookingId",
        "visibleRange",
        "bookingItemId",
        "bookingItemtypeId",
        "circulationRules",
        "modelValue",
        "maxBookingPeriod",
    ],
    setup(props) {
        const rangeAnchor = computed(() => {
            const v = props.modelValue;
            if (Array.isArray(v) && v.length >= 1 && v[0] instanceof Date)
                return v[0];
            return null;
        });
        const selectedDateRange = computed(() => {
            const v = props.modelValue;
            if (!Array.isArray(v)) return [];
            return v.filter(d => d instanceof Date).map(d => d.toISOString());
        });
        const refs = toRefs(props);
        return useBookingCalendarMaps({
            ...refs,
            rangeAnchor,
            selectedDateRange,
        });
    },
    template: `<div data-cy="composable-host" />`,
};

// DOM smoke harness: mounts BaseFlatpickr with the composable's outputs
// wired in. Used only by the bottom-of-file smoke describe to confirm the
// composable's Maps still slot into the picker's prop contract.
const RangeHostWithPicker = {
    components: { BaseFlatpickr },
    props: [
        "bookableItems",
        "bookings",
        "checkouts",
        "holidays",
        "editBookingId",
        "visibleRange",
        "modelValue",
        "maxBookingPeriod",
        "circulationRules",
    ],
    setup(props) {
        const rangeAnchor = computed(() => {
            const v = props.modelValue;
            if (Array.isArray(v) && v.length >= 1 && v[0] instanceof Date)
                return v[0];
            return null;
        });
        const selectedDateRange = computed(() => {
            const v = props.modelValue;
            if (!Array.isArray(v)) return [];
            return v.filter(d => d instanceof Date).map(d => d.toISOString());
        });
        const refs = toRefs(props);
        const { disabledByDate, markersByDate, classByDate, rangePreviewFn } =
            useBookingCalendarMaps({
                ...refs,
                rangeAnchor,
                selectedDateRange,
            });
        return {
            disabledByDate,
            markersByDate,
            classByDate,
            rangePreviewFn,
            viewport: MARCH_2026,
        };
    },
    template: `
        <BaseFlatpickr
            mode="range"
            inline
            :viewport="viewport"
            min-date="2026-03-01"
            :model-value="modelValue"
            :disabled="disabledByDate"
            :markers-by-date="markersByDate"
            :class-by-date="classByDate"
            :range-preview-fn="rangePreviewFn"
        />
    `,
};

const day = label => cy.get(`.flatpickr-day[aria-label="${label}"]`);

// Pin today to before the March 2026 fixtures so the past-date guard
// inside createDisableFunction does not poison assertions. Pass an ISO
// string per reference_cypress_clock_cross_realm_dates: a Date instance
// would cross realms when handed to AUT-side libraries.
beforeEach(() => {
    cy.clock(new Date("2026-02-15T12:00:00Z").getTime(), ["Date"]);
});

function defaultProps(overrides) {
    return Object.assign(
        {
            bookableItems: [item("1")],
            bookings: [],
            checkouts: [],
            holidays: [],
            editBookingId: null,
            visibleRange: MARCH_RANGE,
            circulationRules: [],
        },
        overrides || {}
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

describe("useBookingCalendarMaps (disabledByDate by item availability)", () => {
    it("hard-disables a day when every item has a booking on it", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [
                    booking("1", "2026-03-15", "2026-03-15"),
                    booking("2", "2026-03-15", "2026-03-15", {
                        booking_id: 2,
                    }),
                ],
            }),
        }).then(({ wrapper }) => {
            const entry = wrapper.vm.disabledByDate.get("2026-03-15");
            expect(entry?.severity).to.equal("hard");
            expect(wrapper.vm.disabledByDate.has("2026-03-16")).to.be.false;
        });
    });

    it("does not hard-disable a day when one item is still free", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
            }),
        }).then(({ wrapper }) => {
            expect(wrapper.vm.disabledByDate.has("2026-03-15")).to.be.false;
        });
    });

    it("hard-disables when one item has a booking and the other is checked out", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                checkouts: [
                    {
                        issue_id: 200,
                        item_id: "2",
                        checkout_date: "2026-03-14T00:00:00Z",
                        due_date: "2026-03-16T23:59:59Z",
                        patron_id: 5,
                    },
                ],
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-15")?.severity
            ).to.equal("hard");
        });
    });

    it("excludes the booking being edited from the unavailability map", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [
                    booking("1", "2026-03-15", "2026-03-15", {
                        booking_id: 100,
                    }),
                ],
                editBookingId: 100,
            }),
        }).then(({ wrapper }) => {
            expect(wrapper.vm.disabledByDate.has("2026-03-15")).to.be.false;
        });
    });

    it("emits a booked marker entry on a day with a booking", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
            }),
        }).then(({ wrapper }) => {
            const markers = wrapper.vm.markersByDate.get("2026-03-15");
            expect(markers, "markers for Mar 15").to.exist;
            expect(
                markers.some(m => m.className === "booking-marker-dot--booked")
            ).to.be.true;
        });
    });

    it("emits a checked-out marker entry on a day with a checkout", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                checkouts: [
                    {
                        issue_id: 200,
                        item_id: "1",
                        checkout_date: "2026-03-14T00:00:00Z",
                        due_date: "2026-03-16T23:59:59Z",
                        patron_id: 5,
                    },
                ],
            }),
        }).then(({ wrapper }) => {
            const markers = wrapper.vm.markersByDate.get("2026-03-15");
            expect(markers).to.exist;
            expect(
                markers.some(
                    m => m.className === "booking-marker-dot--checked-out"
                )
            ).to.be.true;
        });
    });
});

describe("useBookingCalendarMaps (anchor-aware soft severity)", () => {
    it("hard-disables a holiday when no anchor is set", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({ holidays: ["2026-03-15"] }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-15")?.severity
            ).to.equal("hard");
        });
    });

    it("soft-disables a holiday when an anchor is set", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                holidays: ["2026-03-12"],
                modelValue: [new Date(2026, 2, 10), null],
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-12")?.severity
            ).to.equal("soft");
        });
    });

    it("flips severity when modelValue changes from null to anchor", () => {
        let host;
        cy.mount(ComposableHost, {
            props: defaultProps({
                holidays: ["2026-03-12"],
                modelValue: null,
            }),
        }).then(({ wrapper }) => {
            host = wrapper;
            expect(
                wrapper.vm.disabledByDate.get("2026-03-12")?.severity
            ).to.equal("hard");
        });
        cy.then(() =>
            host.setProps({ modelValue: [new Date(2026, 2, 10), null] })
        );
        cy.then(() => {
            expect(host.vm.disabledByDate.get("2026-03-12")?.severity).to.equal(
                "soft"
            );
        });
    });

    it("keeps a holiday hard-disabled when bookings also block all items that day", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [booking("1", "2026-03-12", "2026-03-12")],
                holidays: ["2026-03-12"],
                modelValue: [new Date(2026, 2, 10), null],
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-12")?.severity
            ).to.equal("hard");
        });
    });
});

describe("useBookingCalendarMaps (classByDate constrained-range)", () => {
    it("returns no constrained-range entries when there is no anchor", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: null,
                maxBookingPeriod: 5,
            }),
        }).then(({ wrapper }) => {
            // No anchor → classByDate has no constrained-range marker.
            const has = key =>
                (wrapper.vm.classByDate.get(key) || "").includes(
                    "booking-constrained-range-marker"
                );
            expect(has("2026-03-10")).to.be.false;
            expect(has("2026-03-14")).to.be.false;
        });
    });

    it("marks anchor through anchor + maxBookingPeriod - 1 as constrained range", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
            }),
        }).then(({ wrapper }) => {
            const has = key =>
                (wrapper.vm.classByDate.get(key) || "").includes(
                    "booking-constrained-range-marker"
                );
            expect(has("2026-03-10")).to.be.true;
            expect(has("2026-03-14")).to.be.true;
            expect(has("2026-03-15")).to.be.false;
        });
    });

    it("emits no constrained-range entries when maxBookingPeriod is missing or zero", () => {
        // The anchor day still gets the loan-boundary class (which doesn't
        // depend on maxPeriod), so we assert on the absence of the
        // constrained-range class specifically, not the whole entry.
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 0,
            }),
        }).then(({ wrapper }) => {
            const has = key =>
                (wrapper.vm.classByDate.get(key) || "").includes(
                    "booking-constrained-range-marker"
                );
            expect(has("2026-03-10")).to.be.false;
            expect(has("2026-03-14")).to.be.false;
        });
    });

    it("moves the highlight when the anchor changes", () => {
        let host;
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
            }),
        }).then(({ wrapper }) => {
            host = wrapper;
            expect(
                (wrapper.vm.classByDate.get("2026-03-14") || "").includes(
                    "booking-constrained-range-marker"
                )
            ).to.be.true;
        });
        cy.then(() =>
            host.setProps({ modelValue: [new Date(2026, 2, 20), null] })
        );
        cy.then(() => {
            expect(
                (host.vm.classByDate.get("2026-03-14") || "").includes(
                    "booking-constrained-range-marker"
                )
            ).to.be.false;
            expect(
                (host.vm.classByDate.get("2026-03-24") || "").includes(
                    "booking-constrained-range-marker"
                )
            ).to.be.true;
        });
    });

    it("clamps the highlight at the first blocking date inside the constrained range", () => {
        // anchor=Mar 10, maxPeriod=10 → naive constrained range Mar 10-19.
        // With a booking blocking Mar 15, findFirstBlockingDate clamps the
        // highlight at Mar 14. Days past the blocker stay unhighlighted.
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 10,
            }),
        }).then(({ wrapper }) => {
            const has = key =>
                (wrapper.vm.classByDate.get(key) || "").includes(
                    "booking-constrained-range-marker"
                );
            expect(has("2026-03-10")).to.be.true;
            expect(has("2026-03-14")).to.be.true;
            expect(has("2026-03-15")).to.be.false;
            // Days past the blocker stay unhighlighted even though they sit
            // within anchor+maxPeriod — proving the clamp, not an accidental
            // gap on the blocker day.
            expect(has("2026-03-18")).to.be.false;
        });
    });
});

describe("useBookingCalendarMaps (rangePreviewFn)", () => {
    it("returns valid for a clear range within maxBookingPeriod", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 10,
            }),
        }).then(({ wrapper }) => {
            const status = wrapper.vm.rangePreviewFn(
                new Date(2026, 2, 10),
                new Date(2026, 2, 14)
            );
            expect(status.status).to.equal("valid");
        });
    });

    it("returns invalid when range exceeds maxBookingPeriod", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 3,
            }),
        }).then(({ wrapper }) => {
            const status = wrapper.vm.rangePreviewFn(
                new Date(2026, 2, 10),
                new Date(2026, 2, 15)
            );
            expect(status.status).to.equal("invalid");
            expect(status.message).to.contain("max booking period");
        });
    });

    it("returns invalid when range crosses a hard-disabled booking day", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [booking("1", "2026-03-12", "2026-03-12")],
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 30,
            }),
        }).then(({ wrapper }) => {
            const status = wrapper.vm.rangePreviewFn(
                new Date(2026, 2, 10),
                new Date(2026, 2, 14)
            );
            expect(status.status).to.equal("invalid");
        });
    });

    it("returns valid when range crosses only a soft-disabled holiday", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                holidays: ["2026-03-12"],
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 30,
            }),
        }).then(({ wrapper }) => {
            const status = wrapper.vm.rangePreviewFn(
                new Date(2026, 2, 10),
                new Date(2026, 2, 14)
            );
            expect(status.status).to.equal("valid");
        });
    });

    it("returns invalid when end is before anchor", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 30,
            }),
        }).then(({ wrapper }) => {
            const status = wrapper.vm.rangePreviewFn(
                new Date(2026, 2, 10),
                new Date(2026, 2, 5)
            );
            expect(status.status).to.equal("invalid");
            expect(status.message).to.contain("on or after");
        });
    });
});

describe("useBookingCalendarMaps (selected-item awareness)", () => {
    it("hard-disables a day when the selected bookingItemId has a booking", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                bookingItemId: "1",
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-15")?.severity
            ).to.equal("hard");
        });
    });

    it("does not hard-disable when bookingItemId points to a free item", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                bookingItemId: "2",
            }),
        }).then(({ wrapper }) => {
            expect(wrapper.vm.disabledByDate.has("2026-03-15")).to.be.false;
        });
    });

    it("narrows the disable check to bookingItemtypeId when no specific item is selected", () => {
        const itemWithType = (id, typeId) => ({
            item_id: id,
            title: `Item ${id}`,
            item_type_id: typeId,
            effective_item_type_id: typeId,
        });
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookableItems: [
                    itemWithType("1", "BK"),
                    itemWithType("2", "DVD"),
                ],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                bookingItemtypeId: "BK",
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-15")?.severity
            ).to.equal("hard");
        });
    });

    it("emits lead and trail marker entries when circulationRules has lead/trail periods", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                circulationRules: [
                    { bookings_lead_period: 2, bookings_trail_period: 2 },
                ],
            }),
        }).then(({ wrapper }) => {
            const lead = wrapper.vm.markersByDate.get("2026-03-13");
            const trail = wrapper.vm.markersByDate.get("2026-03-17");
            expect(lead).to.exist;
            expect(lead.some(m => m.className === "booking-marker-dot--lead"))
                .to.be.true;
            expect(trail).to.exist;
            expect(trail.some(m => m.className === "booking-marker-dot--trail"))
                .to.be.true;
        });
    });
});

// Renderless harness that exposes loanBoundaryTimes directly so the Set
// contents can be asserted without going through the picker. The
// integration spec at bookingsModalDatePicker reads
// fp._loanBoundaryTimes, so this output is a real contract; pin the math.
const LoanBoundaryHost = {
    props: [
        "bookableItems",
        "bookings",
        "checkouts",
        "holidays",
        "editBookingId",
        "modelValue",
        "circulationRules",
    ],
    setup(props) {
        const rangeAnchor = computed(() => {
            const v = props.modelValue;
            if (Array.isArray(v) && v.length >= 1 && v[0] instanceof Date)
                return v[0];
            return null;
        });
        const refs = toRefs(props);
        const { loanBoundaryTimes } = useBookingCalendarMaps({
            ...refs,
            rangeAnchor,
        });
        return { loanBoundaryTimes };
    },
    template: `<div data-cy="loan-boundary-host" />`,
};

describe("useBookingCalendarMaps (loanBoundaryTimes)", () => {
    const startOfDay = (year, month0, day) =>
        new Date(year, month0, day, 0, 0, 0, 0).getTime();

    it("returns an empty Set when no anchor is set", () => {
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: null,
                circulationRules: [{ issuelength: 7 }],
            },
        }).then(({ wrapper }) => {
            expect([...wrapper.vm.loanBoundaryTimes]).to.deep.equal([]);
        });
    });

    it("returns just the anchor timestamp when issuelength is missing", () => {
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: [new Date(2026, 2, 10), null],
                circulationRules: [{}],
            },
        }).then(({ wrapper }) => {
            expect([...wrapper.vm.loanBoundaryTimes]).to.deep.equal([
                startOfDay(2026, 2, 10),
            ]);
        });
    });

    it("includes anchor + anchor+issuelength when only issuelength is set", () => {
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: [new Date(2026, 2, 10), null],
                circulationRules: [{ issuelength: 7 }],
            },
        }).then(({ wrapper }) => {
            expect([...wrapper.vm.loanBoundaryTimes].sort()).to.deep.equal(
                [startOfDay(2026, 2, 10), startOfDay(2026, 2, 17)].sort()
            );
        });
    });

    it("adds one boundary per renewal when renewalperiod and renewalsallowed are set", () => {
        // anchor=Mar 10, issuelength=5, renewalperiod=3, renewalsallowed=2:
        // expect {Mar 10, Mar 15 (issuelength), Mar 18 (k=1), Mar 21 (k=2)}.
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: [new Date(2026, 2, 10), null],
                circulationRules: [
                    {
                        issuelength: 5,
                        renewalperiod: 3,
                        renewalsallowed: 2,
                    },
                ],
            },
        }).then(({ wrapper }) => {
            expect([...wrapper.vm.loanBoundaryTimes].sort()).to.deep.equal(
                [
                    startOfDay(2026, 2, 10),
                    startOfDay(2026, 2, 15),
                    startOfDay(2026, 2, 18),
                    startOfDay(2026, 2, 21),
                ].sort()
            );
        });
    });

    it("ignores renewals when renewalperiod is zero", () => {
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: [new Date(2026, 2, 10), null],
                circulationRules: [
                    {
                        issuelength: 5,
                        renewalperiod: 0,
                        renewalsallowed: 3,
                    },
                ],
            },
        }).then(({ wrapper }) => {
            expect([...wrapper.vm.loanBoundaryTimes].sort()).to.deep.equal(
                [startOfDay(2026, 2, 10), startOfDay(2026, 2, 15)].sort()
            );
        });
    });

    it("recomputes when the anchor changes", () => {
        let host;
        cy.mount(LoanBoundaryHost, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                modelValue: [new Date(2026, 2, 10), null],
                circulationRules: [{ issuelength: 5 }],
            },
        }).then(({ wrapper }) => {
            host = wrapper;
            expect([...wrapper.vm.loanBoundaryTimes].sort()).to.deep.equal(
                [startOfDay(2026, 2, 10), startOfDay(2026, 2, 15)].sort()
            );
        });
        // setProps returns a Promise that resolves after Vue's nextTick;
        // cy.then awaits it so the assertion reads the post-flush value.
        cy.then(() =>
            host.setProps({
                modelValue: [new Date(2026, 2, 20), null],
            })
        );
        cy.then(() => {
            expect([...host.vm.loanBoundaryTimes].sort()).to.deep.equal(
                [startOfDay(2026, 2, 20), startOfDay(2026, 2, 25)].sort()
            );
        });
    });
});

describe("useBookingCalendarMaps (end-date-only mode)", () => {
    // booking_constraint_mode: "end_date_only" means the user picks the
    // anchor and the picker enforces a fixed range from anchor to
    // anchor+maxPeriod. Intermediate days inside that span are soft-
    // disabled so they can't be clicked (which would otherwise restart
    // the range), but the range itself stays committable.
    it("soft-disables intermediate dates between anchor and anchor+max", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
                circulationRules: [
                    { booking_constraint_mode: "end_date_only" },
                ],
            }),
        }).then(({ wrapper }) => {
            // Mar 11..14 are intermediate; Mar 10 is anchor; Mar 15 is the
            // calculated end and the only valid commit target.
            expect(
                wrapper.vm.disabledByDate.get("2026-03-11")?.severity
            ).to.equal("soft");
            expect(
                wrapper.vm.disabledByDate.get("2026-03-14")?.severity
            ).to.equal("soft");
            expect(wrapper.vm.disabledByDate.has("2026-03-15")).to.be.false;
        });
    });

    it("tags intermediates with booking-intermediate-blocked in classByDate", () => {
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
                circulationRules: [
                    { booking_constraint_mode: "end_date_only" },
                ],
            }),
        }).then(({ wrapper }) => {
            const has = key =>
                (wrapper.vm.classByDate.get(key) || "").includes(
                    "booking-intermediate-blocked"
                );
            expect(has("2026-03-11")).to.be.true;
            expect(has("2026-03-14")).to.be.true;
            // Anchor and the calculated end are not intermediates.
            expect(has("2026-03-10")).to.be.false;
        });
    });

    it("space-merges intermediate-blocked with constrained-range-marker", () => {
        // Intermediate days are also inside the constrained range, so the
        // classByDate output joins both classes with a space. A regression
        // that overwrote one with the other would surface here.
        cy.mount(ComposableHost, {
            props: defaultProps({
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
                circulationRules: [
                    { booking_constraint_mode: "end_date_only" },
                ],
            }),
        }).then(({ wrapper }) => {
            const cls = wrapper.vm.classByDate.get("2026-03-12") || "";
            expect(cls).to.contain("booking-intermediate-blocked");
            expect(cls).to.contain("booking-constrained-range-marker");
        });
    });

    it("keeps an intermediate hard-disabled when a booking blocks all items", () => {
        // A hard block (booking covers every relevant item) wins over the
        // intermediate-soft tag — composable's disabledByDate short-circuits
        // when the existing severity is 'hard'.
        cy.mount(ComposableHost, {
            props: defaultProps({
                bookings: [booking("1", "2026-03-12", "2026-03-12")],
                modelValue: [new Date(2026, 2, 10), null],
                maxBookingPeriod: 5,
                circulationRules: [
                    { booking_constraint_mode: "end_date_only" },
                ],
            }),
        }).then(({ wrapper }) => {
            expect(
                wrapper.vm.disabledByDate.get("2026-03-12")?.severity
            ).to.equal("hard");
        });
    });
});

// Smoke tests: the composable's outputs should still slot into BaseFlatpickr
// cleanly. These mount the picker and assert on rendered classes — one per
// output type — to catch contract drift between the composable and the
// wrapper without re-testing the per-case logic above.
describe("useBookingCalendarMaps (DOM smoke tests)", () => {
    it("disabledByDate severity 'hard' renders flatpickr-disabled", () => {
        cy.mount(RangeHostWithPicker, {
            props: {
                bookableItems: [item("1"), item("2")],
                bookings: [
                    booking("1", "2026-03-15", "2026-03-15"),
                    booking("2", "2026-03-15", "2026-03-15", {
                        booking_id: 2,
                    }),
                ],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                visibleRange: MARCH_RANGE,
                modelValue: null,
                maxBookingPeriod: 0,
                circulationRules: [],
            },
        });
        day("March 15, 2026").should("have.class", "flatpickr-disabled");
    });

    it("markersByDate kind 'booked' renders booking-marker-dot--booked", () => {
        cy.mount(RangeHostWithPicker, {
            props: {
                bookableItems: [item("1"), item("2")],
                bookings: [booking("1", "2026-03-15", "2026-03-15")],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                visibleRange: MARCH_RANGE,
                modelValue: null,
                maxBookingPeriod: 0,
                circulationRules: [],
            },
        });
        day("March 15, 2026").should(
            "have.class",
            "booking-marker-dot--booked"
        );
    });

    it("classByDate merges booking-loan-boundary and constrained-range-marker on the right days", () => {
        // Anchor=Mar 10, issuelength=5 → boundaries at Mar 10 and Mar 15.
        // The class must land on the day cell via the classByDate output;
        // this validates the merge with the constrained-range class.
        cy.mount(RangeHostWithPicker, {
            props: {
                bookableItems: [item("1")],
                bookings: [],
                checkouts: [],
                holidays: [],
                editBookingId: null,
                visibleRange: MARCH_RANGE,
                modelValue: [new Date("2026-03-10"), null],
                maxBookingPeriod: 10,
                circulationRules: [{ issuelength: 5 }],
            },
        });
        day("March 10, 2026").should("have.class", "booking-loan-boundary");
        day("March 15, 2026").should("have.class", "booking-loan-boundary");
        // Sanity: a non-boundary day inside the constrained range gets the
        // range marker but not the boundary class.
        day("March 12, 2026")
            .should("have.class", "booking-constrained-range-marker")
            .should("not.have.class", "booking-loan-boundary");
    });
});
