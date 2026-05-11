import { createPinia, setActivePinia } from "pinia";
import { useBookingStore } from "@koha-vue/stores/bookings";

/**
 * Store-level regression tests for the effects section's auto-fetch
 * watchers. These guard against reactive feedback loops: the pickup
 * locations fetch writes to data.pickupLocations, which feeds the
 * constraint computeds the watchers read — a cycle that must be broken
 * by watching explicit, value-stable sources rather than auto-tracking.
 */
describe("bookings store effects", () => {
    beforeEach(() => {
        // Catch-all so unrelated fetches (holidays, etc.) never hit the
        // network; specific intercepts below take precedence.
        cy.intercept("GET", "**/api/v1/**", { body: [] });
        cy.intercept("GET", "**/api/v1/biblios/*/pickup_locations*", {
            body: [
                {
                    library_id: "CPL",
                    name: "Centerville",
                    pickup_items: [101],
                },
                { library_id: "MPL", name: "Midway", pickup_items: [102] },
            ],
        }).as("pickupLocations");
        cy.intercept("GET", "**/api/v1/circulation_rules*", {
            body: [{ bookings_lead_period: 0, bookings_trail_period: 0 }],
        }).as("circulationRules");
    });

    it("settles after patron selection instead of refetching pickup locations in a loop", () => {
        setActivePinia(createPinia());
        const store = useBookingStore();

        store.configureExternalInputs({ biblionumber: "1" });
        store.bookableItems = [
            {
                item_id: 101,
                home_library_id: "CPL",
                effective_item_type_id: "BK",
            },
        ];
        store.itemTypes = [{ item_type_id: "BK", description: "Book" }];

        // Selecting a patron triggers the pickup-locations fetch; once it
        // resolves, the default-library watcher sets pickupLibraryId to the
        // patron's home library, which activates the item-type constraint
        // predicate — the exact condition under which the feedback loop
        // used to self-sustain.
        store.bookingPatron = {
            patron_id: "42",
            category_id: "ST",
            library_id: "CPL",
        };

        cy.wait("@pickupLocations");
        // Retry until the default-library watcher has run; it fires a
        // tick after the pickup-locations response is committed.
        cy.wrap(store).its("pickupLibraryId").should("equal", "CPL");

        // Negative assertion (absence of further fetches) needs a settle
        // window; with the loop present this accumulates a fetch every few
        // milliseconds, so 750ms separates the two cases unambiguously.
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(750);
        cy.get("@pickupLocations.all").then(calls => {
            expect(
                calls.length,
                "pickup_locations requests after one patron selection"
            ).to.be.at.most(2);
        });
    });
});
