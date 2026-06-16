import BookingPeriodStep from "@koha-vue/components/Bookings/BookingPeriodStep.vue";
import { useBookingStore } from "@koha-vue/stores/bookings";

const item = id => ({
    item_id: id,
    title: `Item ${id}`,
    barcode: `bar-${id}`,
});

// Pin today to before the March 2026 fixtures so createDisableFunction's
// past-date guard does not poison assertions. Pass an ISO string per
// reference_cypress_clock_cross_realm_dates — a Date instance would
// cross realms once handed to AUT-side libraries.
beforeEach(() => {
    cy.clock(new Date("2026-02-15T12:00:00Z").getTime(), ["Date"]);
});

// Parent wrapper that seeds the bookings store synchronously inside its
// own setup() — this guarantees BookingPeriodStep's useAvailability /
// availability section initialize against the seeded state on the very
// first run, instead of racing a post-mount $patch through reactivity.
// Constraint configuration goes through store.configureConstraints
// (mirroring what BookingModal does in production) rather than props.
const Host = {
    components: { BookingPeriodStep },
    props: ["stepNumber", "calendarEnabled", "storeSeed", "constraints"],
    emits: ["clear-dates"],
    setup(props) {
        const store = useBookingStore();
        Object.assign(store, {
            bookableItems: [item("1")],
            bookings: [],
            checkouts: [],
            holidays: [],
            circulationRules: [],
            selectedDateRange: [],
            ...(props.storeSeed || {}),
        });
        if (props.constraints) {
            store.configureConstraints(props.constraints);
        }
        return {};
    },
    template: `
        <BookingPeriodStep
            :step-number="stepNumber"
            :calendar-enabled="calendarEnabled"
            @clear-dates="$emit('clear-dates')"
        />
    `,
};

function mountStep(storeSeed = {}, props = {}) {
    return cy.mount(Host, {
        props: {
            stepNumber: 1,
            calendarEnabled: true,
            storeSeed,
            ...props,
        },
    });
}

// Scope: this spec covers the picker-free wiring around BookingPeriodStep
// — pure DOM/store assertions that don't need the flatpickr calendar to
// be open. Picker interaction (range commit, hover-trail/lead, hover
// feedback, auto-navigate-end) is exercised by the integration specs at
// t/cypress/integration/Circulation/bookingsModal*_spec.ts; the
// underlying primitives (BookingFlatpickr, useBookingCalendarMaps) have
// dedicated component specs.

describe("BookingPeriodStep — constraint info alert", () => {
    it("renders the alert when a constraint and a positive max period are set", () => {
        // dateRangeConstraint=issuelength + circulationRules.issuelength=7
        // resolves through calculateMaxBookingPeriod to maxBookingPeriod=7.
        mountStep(
            { circulationRules: [{ issuelength: 7 }] },
            { constraints: { dateRangeConstraint: "issuelength" } }
        );
        cy.get(".booking-constraint-info").should("exist");
        cy.get(".booking-constraint-info").should(
            "contain.text",
            "Booking period limited to checkout length (7 days)"
        );
    });

    it("hides the alert when maxBookingPeriod is zero", () => {
        // 0 means "no booking allowed" — surfacing the help text would
        // contradict the disabled state, so the alert short-circuits.
        mountStep(
            { circulationRules: [{ issuelength: 0 }] },
            { constraints: { dateRangeConstraint: "issuelength" } }
        );
        cy.get(".booking-constraint-info").should("not.exist");
    });

    it("hides the alert when no constraint is configured", () => {
        // Without configureConstraints, dateRangeConstraint stays null
        // and maxBookingPeriod resolves to null — the alert's v-if is
        // gated on dateRangeConstraint, so it's hidden either way.
        mountStep({ circulationRules: [{ issuelength: 7 }] });
        cy.get(".booking-constraint-info").should("not.exist");
    });
});

describe("BookingPeriodStep — constraintHelpText per variant", () => {
    it("renders the issuelength_with_renewals variant with the combined period", () => {
        // issuelength=5, renewalperiod=3, renewalsallowed=2 →
        // calculateMaxBookingPeriod = 5 + 3 * 2 = 11.
        mountStep(
            {
                circulationRules: [
                    {
                        issuelength: 5,
                        renewalperiod: 3,
                        renewalsallowed: 2,
                    },
                ],
            },
            {
                constraints: {
                    dateRangeConstraint: "issuelength_with_renewals",
                },
            }
        );
        cy.get(".booking-constraint-info").should(
            "contain.text",
            "Booking period limited to checkout length with renewals (11 days)"
        );
    });

    it("renders the default variant for an unrecognised constraint via custom formula", () => {
        // dateRangeConstraint="custom" with customDateRangeFormula gives a
        // numeric period but doesn't match issuelength* in baseMessages,
        // so constraintHelpText falls through to the default message.
        mountStep(
            { circulationRules: [{ issuelength: 7 }] },
            {
                constraints: {
                    dateRangeConstraint: "custom",
                    customDateRangeFormula: () => 14,
                },
            }
        );
        cy.get(".booking-constraint-info").should(
            "contain.text",
            "Booking period limited by circulation rules (14 days)"
        );
    });

    it("renders the no-period variant when maxBookingPeriod is null", () => {
        // Empty circulationRules → calculateMaxBookingPeriod returns null
        // (early return at rules?.[0]). The alert still shows because its
        // v-if accepts a null period, and constraintHelpText drops the
        // (X days) suffix.
        mountStep(
            { circulationRules: [] },
            { constraints: { dateRangeConstraint: "issuelength" } }
        );
        cy.get(".booking-constraint-info")
            .should("contain.text", "Booking period limited to checkout length")
            .should("not.contain.text", "(");
    });
});

describe("BookingPeriodStep — clear button", () => {
    it("empties selectedDateRange in the store and emits clear-dates", () => {
        const onClear = cy.stub().as("onClear");
        mountStep(
            {
                selectedDateRange: [
                    "2026-03-10T00:00:00.000Z",
                    "2026-03-14T00:00:00.000Z",
                ],
            },
            { "onClear-dates": onClear }
        );
        cy.get(".booking-date-picker-append button").click();
        cy.then(() => {
            const store = useBookingStore();
            expect(store.selectedDateRange).to.deep.equal([]);
        });
        cy.get("@onClear").should("have.been.calledOnce");
    });

    it("disables the clear button when calendarEnabled is false", () => {
        // calendarEnabled false is how the parent step gates input until
        // upstream selections (item type / patron) are made. The clear
        // button mirrors the picker's enabled state so users can't reset
        // a disabled control.
        mountStep({}, { calendarEnabled: false });
        cy.get(".booking-date-picker-append button").should("be.disabled");
    });
});
