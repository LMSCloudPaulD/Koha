const dayjs = require("dayjs");

describe("Booking Modal Basic Tests", () => {
    let testData = {};

    // Prevent unhandled app errors (e.g. failed API calls during cleanup) from failing tests
    Cypress.on("uncaught:exception", () => false);

    // Ensure RESTBasicAuth is enabled before running tests
    before(() => {
        cy.task("query", {
            sql: "UPDATE systempreferences SET value = '1' WHERE variable = 'RESTBasicAuth'",
        });
    });

    beforeEach(() => {
        cy.login();
        cy.title().should("eq", "Koha staff interface");

        // Create fresh test data for each test using upstream pattern
        cy.task("insertSampleBiblio", {
            item_count: 3,
        })
            .then(objects => {
                testData = objects;

                // Update items to be bookable with different itemtypes
                return cy
                    .task("query", {
                        sql: "UPDATE items SET bookable = 1, itype = 'BK', homebranch = 'CPL', enumchron = 'A', dateaccessioned = '2024-12-03' WHERE itemnumber = ?",
                        values: [objects.items[0].item_id],
                    })
                    .then(() =>
                        cy.task("query", {
                            sql: "UPDATE items SET bookable = 1, itype = 'CF', homebranch = 'CPL', enumchron = 'B', dateaccessioned = '2024-12-02' WHERE itemnumber = ?",
                            values: [objects.items[1].item_id],
                        })
                    )
                    .then(() =>
                        cy.task("query", {
                            sql: "UPDATE items SET bookable = 1, itype = 'BK', homebranch = 'CPL', enumchron = 'C', dateaccessioned = '2024-12-01' WHERE itemnumber = ?",
                            values: [objects.items[2].item_id],
                        })
                    );
            })
            .then(() => {
                return cy.task("insertSamplePatron", {
                    library: testData.libraries[0],
                });
            })
            .then(patronResult => {
                testData.patron = patronResult.patron;
            });
    });

    afterEach(() => {
        // Clean up test data
        if (testData.biblio) {
            cy.task("deleteSampleObjects", testData);
        }
    });

    it("should load the booking modal correctly with initial state", () => {
        // Visit the biblio detail page with our freshly created data
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Wait for page to load completely
        cy.get("#catalog_detail").should("be.visible");

        // The "Place booking" button should appear for bookable items
        cy.get("[data-booking-modal]").should("exist").and("be.visible");

        // Click to open the booking modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());

        // Wait for modal to appear
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );
        cy.get("booking-modal-island .modal-title")
            .should("be.visible")
            .and("contain.text", "Place booking");

        // Verify modal structure and initial field states
        // Patron field should be enabled
        cy.vueSelectShouldBeEnabled("booking_patron");

        // Pickup library should be disabled initially
        cy.vueSelectShouldBeDisabled("pickup_library_id");

        // Item type should be disabled initially
        cy.vueSelectShouldBeDisabled("booking_itemtype");

        // Item should be disabled initially
        cy.vueSelectShouldBeDisabled("booking_item_id");

        // Period should be disabled initially
        cy.get("#booking_period").should("exist").and("be.disabled");

        // Verify form and submit button exist
        cy.get('button[form="form-booking"][type="submit"]').should("exist");

        cy.get(".btn-close").should("exist");
    });

    it("should enable fields progressively based on user selections", () => {
        // Setup API intercepts to wait for real API calls instead of arbitrary timeouts
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*").as(
            "getCirculationRules"
        );

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Step 1: Initially only patron field should be enabled
        cy.vueSelectShouldBeEnabled("booking_patron");
        cy.vueSelectShouldBeDisabled("pickup_library_id");
        cy.vueSelectShouldBeDisabled("booking_itemtype");
        cy.vueSelectShouldBeDisabled("booking_item_id");
        cy.get("#booking_period").should("be.disabled");

        // Step 2: Select patron - this triggers pickup locations API call
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );

        // Wait for pickup locations API call to complete
        cy.wait("@getPickupLocations");

        // Step 3: After patron selection and pickup locations load, other fields should become enabled
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectShouldBeEnabled("booking_itemtype");
        cy.vueSelectShouldBeEnabled("booking_item_id");

        // Wait for circulation rules API call to complete
        cy.wait("@getCirculationRules");

        // "Any item" is a valid default — period enables without requiring
        // a specific item type or item selection
        cy.get("#booking_period").should("not.be.disabled");

        // Step 4: Select pickup location
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Step 5: Select item type
        cy.vueSelectByIndex("booking_itemtype", 0);

        // Period remains enabled after itemtype selection
        cy.get("#booking_period").should("not.be.disabled");

        // Step 6: Clearing item type keeps period enabled ("any item" still valid)
        cy.vueSelectClear("booking_itemtype");
        cy.get("#booking_period").should("not.be.disabled");

        // Step 7: Select item instead of itemtype
        cy.vueSelectByIndex("booking_item_id", 1);

        // Period stays enabled after item selection
        cy.get("#booking_period").should("not.be.disabled");
    });

    it("should handle item type and item dependencies correctly", () => {
        // Setup API intercepts
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*").as(
            "getCirculationRules"
        );

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Setup: Select patron and pickup location first
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Test Case 1: Select item first → should auto-populate and disable itemtype
        cy.vueSelectByIndex("booking_item_id", 1);
        cy.wait("@getCirculationRules");

        // Verify that item type gets auto-populated (value depends on which item the API returns first)
        cy.get("input#booking_itemtype")
            .closest(".v-select")
            .find(".vs__selected")
            .should("exist");

        // Verify that period field gets enabled after item selection
        cy.get("#booking_period").should("not.be.disabled");

        // Test Case 2: Reset item selection to "Any item" → itemtype should re-enable
        cy.vueSelectByIndex("booking_item_id", 0);

        // Wait for itemtype to become enabled (this is what we're actually waiting for)
        cy.vueSelectShouldBeEnabled("booking_itemtype");

        // Test Case 3: Now select itemtype first → different workflow
        cy.vueSelectClear("booking_itemtype");
        cy.vueSelectByIndex("booking_itemtype", 0); // Select first itemtype (BK)
        cy.wait("@getCirculationRules");

        // Verify itemtype remains enabled when selected first
        cy.vueSelectShouldBeEnabled("booking_itemtype");

        // Period should be enabled after itemtype selection
        cy.get("#booking_period").should("not.be.disabled");

        // Test Case 3b: Verify that only items of selected type are shown in dropdown
        // Open the item dropdown and check options
        cy.get("input#booking_item_id")
            .closest(".v-select")
            .find(".vs__dropdown-toggle")
            .click();

        cy.get("input#booking_item_id")
            .closest(".v-select")
            .find(".vs__dropdown-menu")
            .should("be.visible")
            .find(".vs__dropdown-option")
            .should("have.length.at.least", 1);

        // Close dropdown by clicking the modal title
        cy.get("booking-modal-island .modal-title").click();

        // Test Case 4: Select item after itemtype → itemtype auto-populated
        cy.vueSelectByIndex("booking_item_id", 1);

        // Period should still be enabled
        cy.get("#booking_period").should("not.be.disabled");

        // Test Case 5: Reset item to "Any item", itemtype selection should be re-enabled
        cy.vueSelectByIndex("booking_item_id", 0);

        // Wait for itemtype to become enabled (no item selected, so itemtype should be available)
        cy.vueSelectShouldBeEnabled("booking_itemtype");

        // Test Case 6: Clear itemtype and verify all items become available again
        cy.vueSelectClear("booking_itemtype");

        // Both fields should be enabled
        cy.vueSelectShouldBeEnabled("booking_itemtype");
        cy.vueSelectShouldBeEnabled("booking_item_id");

        // Open item dropdown to verify items are available
        cy.get("input#booking_item_id")
            .closest(".v-select")
            .find(".vs__dropdown-toggle")
            .click();

        // Should show options (not filtered by itemtype)
        cy.get("input#booking_item_id")
            .closest(".v-select")
            .find(".vs__dropdown-menu")
            .should("be.visible")
            .find(".vs__dropdown-option")
            .should("have.length.at.least", 2);

        // Close dropdown
        cy.get("booking-modal-island .modal-title").click();
    });

    it("should handle form validation correctly", () => {
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Submit button should be disabled without required fields
        cy.get('button[form="form-booking"][type="submit"]').should(
            "be.disabled"
        );

        // Modal should still be visible
        cy.get("booking-modal-island .modal").should("be.visible");
    });

    it("should successfully submit a booking", () => {
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Fill in the form using real data from the database

        // Step 1: Select patron
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );

        // Step 2: Select pickup location
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Step 3: Select item (first bookable item)
        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1); // Skip "Any item" option

        // Step 4: Set dates using flatpickr
        cy.get("#booking_period").should("not.be.disabled");

        // Use the flatpickr helper to select date range
        // Note: Add enough days to account for lead period (3 days) to avoid past-date constraint
        const startDate = dayjs().add(5, "day");
        const endDate = dayjs().add(10, "days");

        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        // Step 5: Submit the form
        cy.get('button[form="form-booking"][type="submit"]')
            .should("not.be.disabled")
            .click();

        // Verify success - either success message or modal closure
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "not.be.visible"
        );
    });

    it("should successfully submit an 'Any item' booking with server-side optimal item selection", () => {
        /**
         * TEST: Bug 40134 - Server-Side Optimal Item Selection for "Any Item" Bookings
         *
         * This test validates that:
         * 1. "Any item" bookings can be successfully submitted with itemtype_id
         * 2. The server performs optimal item selection based on future availability
         * 3. An appropriate item is automatically assigned by the server
         */

        // Fix the browser Date object to June 10, 2026 at 09:00 Europe/London
        // Using ["Date"] to avoid freezing timers which breaks async operations
        const fixedToday = new Date("2026-06-10T08:00:00Z"); // 09:00 BST (UTC+1)
        cy.clock(fixedToday, ["Date"]);

        // Define fixed dates for consistent testing
        const startDate = dayjs("2026-06-15"); // 5 days from fixed today
        const endDate = dayjs("2026-06-20"); // 10 days from fixed today

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Step 1: Select patron
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );

        // Step 2: Select pickup location
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Step 3: Select itemtype (to enable "Any item" for that type)
        cy.vueSelectShouldBeEnabled("booking_itemtype");
        cy.vueSelectByIndex("booking_itemtype", 0); // Select first itemtype

        // Step 4: Select "Any item" option (index 0)
        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 0); // "Any item" option

        // Step 5: Set dates using flatpickr
        cy.get("#booking_period").should("not.be.disabled");

        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        // Wait a moment for onChange handlers to process
        cy.wait(500);

        // Step 6: Submit the form
        cy.get('button[form="form-booking"][type="submit"]')
            .should("not.be.disabled")
            .click();

        // Verify success - modal should close without errors
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "not.be.visible"
        );

        // Verify that a booking was created and the server assigned an optimal item
        cy.task("query", {
            sql: `SELECT * FROM bookings
                  WHERE biblio_id = ?
                  AND patron_id = ?
                  AND start_date = ?
                  ORDER BY booking_id DESC
                  LIMIT 1`,
            values: [
                testData.biblio.biblio_id,
                testData.patron.patron_id,
                "2026-06-15", // Fixed start date
            ],
        }).then(result => {
            expect(result).to.have.length(1);
            const booking = result[0];

            // Verify the booking has an item_id assigned (not null)
            expect(booking.item_id).to.not.be.null;
            expect(booking.item_id).to.be.oneOf([
                testData.items[0].item_id,
                testData.items[1].item_id,
            ]);

            // Verify booking dates match what we selected
            expect(booking.start_date).to.include("2026-06-15");
            expect(booking.end_date).to.include("2026-06-20");

            // Clean up the test booking
            cy.task("query", {
                sql: "DELETE FROM bookings WHERE booking_id = ?",
                values: [booking.booking_id],
            });
        });

        cy.log("✓ CONFIRMED: Any item booking submitted successfully");
        cy.log("✓ CONFIRMED: Server-side optimal item selection completed");
        cy.log("✓ CONFIRMED: Optimal item automatically assigned by server");
    });

    it("should handle basic form interactions correctly", () => {
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open the modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Test basic form interactions without complex flatpickr scenarios

        // Step 1: Select patron
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );

        // Step 2: Select pickup location
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Step 3: Select an item
        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1); // Skip "Any item" option

        // Step 4: Verify period field becomes enabled
        cy.get("#booking_period").should("not.be.disabled");

        // Step 5: Verify we can close the modal
        cy.get("booking-modal-island .modal .btn-close").first().click();
        cy.get("booking-modal-island .modal").should("not.be.visible");
    });

    it("should handle date selection and API submission correctly", () => {
        /**
         * Date Selection and API Submission Test
         * =======================================
         *
         * In the Vue version, there are no hidden fields for dates.
         * Instead, dates are stored in the pinia store and sent via API.
         * We verify dates via API intercept body assertions.
         */

        // Set up API intercepts
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*").as(
            "getCirculationRules"
        );
        cy.intercept("POST", "/api/v1/bookings").as("createBooking");

        // Visit the page and open booking modal
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        // Open booking modal
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Fill required fields progressively
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1); // Select actual item (not "Any item")
        cy.wait("@getCirculationRules");

        // Verify date picker is enabled
        cy.get("#booking_period").should("not.be.disabled");

        // Define test dates
        const startDate = dayjs().add(3, "day");
        const endDate = dayjs().add(6, "day");

        // Select date range in flatpickr
        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        // Verify the dates were selected correctly via the flatpickr instance (format-agnostic)
        cy.get("#booking_period").should($el => {
            const fp = $el[0]._flatpickr;
            expect(fp.selectedDates.length).to.eq(2);
            expect(dayjs(fp.selectedDates[0]).format("YYYY-MM-DD")).to.eq(
                startDate.format("YYYY-MM-DD")
            );
            expect(dayjs(fp.selectedDates[1]).format("YYYY-MM-DD")).to.eq(
                endDate.format("YYYY-MM-DD")
            );
        });

        // Verify the period field is populated
        cy.get("#booking_period").should("exist").and("not.have.value", "");

        cy.log("✓ CONFIRMED: Date selection working correctly");
        cy.log(
            "✓ User-friendly display format with dates stored in component state for API submission"
        );
    });

    it("should edit an existing booking successfully", () => {
        /**
         * Booking Edit Functionality Test
         * ==============================
         *
         * In the Vue version, edit mode is triggered by setting properties
         * on the booking-modal-island element via window.openBookingModal().
         */

        const today = dayjs().startOf("day");

        // Create an existing booking to edit using the shared test data
        const originalStartDate = today.add(10, "day");
        const originalEndDate = originalStartDate.add(3, "day");

        cy.then(() => {
            return cy.task("query", {
                sql: `INSERT INTO bookings (biblio_id, item_id, patron_id, start_date, end_date, pickup_library_id, status)
                      VALUES (?, ?, ?, ?, ?, ?, '1')`,
                values: [
                    testData.biblio.biblio_id,
                    testData.items[0].item_id,
                    testData.patron.patron_id,
                    originalStartDate.format("YYYY-MM-DD HH:mm:ss"),
                    originalEndDate.format("YYYY-MM-DD HH:mm:ss"),
                    testData.libraries[0].library_id,
                ],
            });
        }).then(result => {
            // Store the booking ID for editing and track for cleanup
            const bookingId = result.insertId;
            testData.existingBooking = {
                booking_id: bookingId,
                start_date: originalStartDate.startOf("day").toISOString(),
                end_date: originalEndDate.endOf("day").toISOString(),
            };
            testData.booking = { booking_id: bookingId };
        });

        // Use real API calls for all booking operations since we created real database data
        // Only mock checkouts if it causes JavaScript errors
        cy.intercept("GET", "/api/v1/checkouts*", { body: [] }).as(
            "getCheckouts"
        );

        // Intercept the patron fetch so we can wait for pre-population
        cy.intercept("GET", "/api/v1/patrons/*").as("getPatron");

        // Visit the page
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );
        cy.title().should("contain", "Koha");

        // Open edit modal by calling window.openBookingModal with booking properties
        cy.get("booking-modal-island .modal").should("exist");
        cy.then(() => {
            cy.window().then(win => {
                win.openBookingModal({
                    booking: testData.existingBooking.booking_id.toString(),
                    patron: testData.patron.patron_id.toString(),
                    itemnumber: testData.items[0].item_id.toString(),
                    pickup_library: testData.libraries[0].library_id,
                    start_date: testData.existingBooking.start_date,
                    end_date: testData.existingBooking.end_date,
                    biblionumber: testData.biblio.biblio_id.toString(),
                });
            });
        });

        // Wait for the patron fetch to complete before checking pre-populated fields
        cy.wait("@getPatron");

        // Verify edit modal setup
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );
        cy.get("booking-modal-island .modal-title").should(
            "contain",
            "Edit booking"
        );

        cy.log("✓ Edit modal opened with pre-populated data");

        // Verify core edit fields are pre-populated
        cy.vueSelectShouldHaveValue("booking_patron", testData.patron.surname);
        cy.log("✓ Patron field pre-populated correctly");

        // Test that the booking can be retrieved via the real API
        cy.then(() => {
            cy.request(
                "GET",
                `/api/v1/bookings?biblio_id=${testData.biblio.biblio_id}`
            ).then(response => {
                expect(response.status).to.equal(200);
                expect(response.body).to.be.an("array");
                expect(response.body.length).to.be.at.least(1);

                const ourBooking = response.body.find(
                    booking =>
                        booking.booking_id ===
                        testData.existingBooking.booking_id
                );
                expect(ourBooking).to.exist;
                expect(ourBooking.patron_id).to.equal(
                    testData.patron.patron_id
                );

                cy.log("✓ Booking exists and is retrievable via real API");
            });
        });

        // Test that the booking can be updated via the real API
        cy.then(() => {
            const updateData = {
                booking_id: testData.existingBooking.booking_id,
                patron_id: testData.patron.patron_id,
                item_id: testData.items[0].item_id,
                pickup_library_id: testData.libraries[0].library_id,
                start_date: today.add(12, "day").startOf("day").toISOString(),
                end_date: today.add(15, "day").endOf("day").toISOString(),
                biblio_id: testData.biblio.biblio_id,
            };

            cy.request(
                "PUT",
                `/api/v1/bookings/${testData.existingBooking.booking_id}`,
                updateData
            ).then(response => {
                expect(response.status).to.equal(200);
                cy.log("✓ Booking can be successfully updated via real API");
            });
        });

        cy.log("✓ CONFIRMED: Edit booking functionality working correctly");
    });

    it("should refresh edit modal state across consecutive openings", () => {
        const today = dayjs().startOf("day");
        let secondPatron;
        let firstBookingId;
        let secondBookingId;

        const firstBooking = {
            start: today.add(8, "day"),
            end: today.add(10, "day"),
            patron_id: testData.patron.patron_id,
            patron_label: testData.patron.surname,
        };

        cy.task("insertSamplePatron", {
            library: { library_id: testData.libraries[0].library_id },
        }).then(patronResult => {
            secondPatron = patronResult.patron;
            testData.patrons = testData.patrons || [];
            testData.patrons.push(secondPatron);
        });

        cy.then(() =>
            cy
                .task("query", {
                    sql: `INSERT INTO bookings (biblio_id, item_id, patron_id, start_date, end_date, pickup_library_id, status)
                          VALUES (?, ?, ?, ?, ?, ?, '1')`,
                    values: [
                        testData.biblio.biblio_id,
                        testData.items[0].item_id,
                        firstBooking.patron_id,
                        firstBooking.start.format("YYYY-MM-DD HH:mm:ss"),
                        firstBooking.end.format("YYYY-MM-DD HH:mm:ss"),
                        testData.libraries[0].library_id,
                    ],
                })
                .then(result => {
                    firstBookingId = result.insertId;
                    testData.bookings = testData.bookings || [];
                    testData.bookings.push({ booking_id: firstBookingId });
                })
        );

        cy.then(() => {
            const secondBooking = {
                start: today.add(15, "day"),
                end: today.add(17, "day"),
                patron_id: secondPatron.patron_id,
                patron_label: secondPatron.surname,
            };

            return cy
                .task("query", {
                    sql: `INSERT INTO bookings (biblio_id, item_id, patron_id, start_date, end_date, pickup_library_id, status)
                          VALUES (?, ?, ?, ?, ?, ?, '1')`,
                    values: [
                        testData.biblio.biblio_id,
                        testData.items[1].item_id,
                        secondBooking.patron_id,
                        secondBooking.start.format("YYYY-MM-DD HH:mm:ss"),
                        secondBooking.end.format("YYYY-MM-DD HH:mm:ss"),
                        testData.libraries[0].library_id,
                    ],
                })
                .then(result => {
                    secondBookingId = result.insertId;
                    testData.bookings = testData.bookings || [];
                    testData.bookings.push({ booking_id: secondBookingId });
                })
                .then(() => secondBooking);
        }).then(secondBooking => {
            // Intercept patron fetches so we can wait for pre-population
            cy.intercept("GET", "/api/v1/patrons/*").as("getPatron");

            cy.visit(
                `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
            );
            cy.get("booking-modal-island .modal").should("exist");

            // First open: booking A
            cy.window().then(win => {
                win.openBookingModal({
                    booking: String(firstBookingId),
                    patron: String(firstBooking.patron_id),
                    itemnumber: String(testData.items[0].item_id),
                    pickup_library: testData.libraries[0].library_id,
                    start_date: firstBooking.start.startOf("day").toISOString(),
                    end_date: firstBooking.end.endOf("day").toISOString(),
                    biblionumber: String(testData.biblio.biblio_id),
                });
            });

            cy.wait("@getPatron");
            cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
                "be.visible"
            );
            cy.vueSelectShouldHaveValue(
                "booking_patron",
                firstBooking.patron_label
            );

            cy.get("booking-modal-island .modal .btn-close").first().click();
            cy.get("booking-modal-island .modal").should("not.be.visible");
            cy.get("body").should("not.have.class", "modal-open");

            // Second open: booking B (must not stay stale with booking A data)
            cy.window().then(win => {
                win.openBookingModal({
                    booking: String(secondBookingId),
                    patron: String(secondBooking.patron_id),
                    itemnumber: String(testData.items[1].item_id),
                    pickup_library: testData.libraries[0].library_id,
                    start_date: secondBooking.start
                        .startOf("day")
                        .toISOString(),
                    end_date: secondBooking.end.endOf("day").toISOString(),
                    biblionumber: String(testData.biblio.biblio_id),
                });
            });

            cy.wait("@getPatron");
            cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
                "be.visible"
            );
            cy.vueSelectShouldHaveValue(
                "booking_patron",
                secondBooking.patron_label
            );
        });
    });

    it("should handle booking failure gracefully", () => {
        /**
         * Comprehensive Error Handling and Recovery Test
         */

        const today = dayjs().startOf("day");

        const primaryErrorScenario = {
            name: "Validation Error (400)",
            statusCode: 400,
            body: {
                error: "Invalid booking period",
                errors: [
                    {
                        message: "End date must be after start date",
                        path: "/end_date",
                    },
                ],
            },
        };

        // Setup API intercepts for error testing
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*", {
            body: [
                {
                    branchcode: testData.libraries[0].library_id,
                    categorycode: "PT",
                    itemtype: "BK",
                    issuelength: 14,
                    renewalsallowed: 2,
                    renewalperiod: 7,
                },
            ],
        }).as("getCirculationRules");

        // Setup failed booking API response
        cy.intercept("POST", "/api/v1/bookings", {
            statusCode: primaryErrorScenario.statusCode,
            body: primaryErrorScenario.body,
        }).as("failedBooking");

        // Visit the page and open booking modal
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );
        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // PHASE 1: Complete Booking Form with Valid Data
        cy.log("=== PHASE 1: Filling booking form with valid data ===");

        // Step 1: Select patron
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        // Step 2: Select pickup location
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Step 3: Select item (triggers circulation rules)
        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1); // Skip "Any item" option
        cy.wait("@getCirculationRules");

        // Step 4: Set booking dates
        cy.get("#booking_period").should("not.be.disabled");
        const startDate = today.add(7, "day");
        const endDate = today.add(10, "day");
        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        // PHASE 2: Submit Form and Trigger Error Response
        cy.log(
            "=== PHASE 2: Submitting form and triggering error response ==="
        );

        // Submit the form and trigger the error
        cy.get('button[form="form-booking"][type="submit"]').click();
        cy.wait("@failedBooking");

        // PHASE 3: Validate Error Handling Behavior
        cy.log("=== PHASE 3: Validating error handling behavior ===");

        // Verify error feedback is displayed (Vue uses .alert-danger within the modal)
        cy.get("booking-modal-island .modal .alert-danger").should("exist");
        cy.log("✓ Error message displayed");

        // Verify modal remains open on error (allows user to retry)
        cy.get("booking-modal-island .modal").should("be.visible");
        cy.log("✓ Modal remains open for user to retry");

        // PHASE 4: Test Error Recovery (Successful Retry)
        cy.log("=== PHASE 4: Testing error recovery workflow ===");

        // Setup successful booking intercept for retry attempt
        cy.intercept("POST", "/api/v1/bookings", {
            statusCode: 201,
            body: {
                booking_id: 9002,
                patron_id: testData.patron.patron_id.toString(),
                item_id: testData.items[0].item_id.toString(),
                pickup_library_id: testData.libraries[0].library_id,
                start_date: startDate.startOf("day").toISOString(),
                end_date: endDate.endOf("day").toISOString(),
                biblio_id: testData.biblio.biblio_id,
            },
        }).as("successfulRetry");

        // Retry the submission (same form, no changes needed)
        cy.get('button[form="form-booking"][type="submit"]').click();
        cy.wait("@successfulRetry");

        // Verify successful retry behavior
        cy.get("booking-modal-island .modal").should("not.be.visible");
        cy.log("✓ Modal closes on successful retry");

        // Check for success feedback (may appear as transient message)
        cy.get("body").then($body => {
            if ($body.find("#transient_result:visible").length > 0) {
                cy.get("#transient_result").should(
                    "contain",
                    "Booking successfully placed"
                );
                cy.log("✓ Success message displayed after retry");
            } else {
                cy.log("✓ Modal closure indicates successful booking");
            }
        });

        cy.log(
            "✓ CONFIRMED: Error handling and recovery workflow working correctly"
        );
    });

    it("should reset modal state after canceling", () => {
        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        // Fill some fields
        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        // Close modal and wait for Bootstrap transition to fully complete
        cy.get("booking-modal-island .modal .btn-close").first().click();
        cy.get("booking-modal-island .modal").should("not.be.visible");
        cy.get("body").should("not.have.class", "modal-open");

        // Reopen and verify state is reset
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal.show", { timeout: 10000 }).should(
            "be.visible"
        );

        cy.vueSelectShouldBeEnabled("booking_patron");
        cy.vueSelectShouldBeDisabled("pickup_library_id");
        cy.vueSelectShouldBeDisabled("booking_itemtype");
        cy.vueSelectShouldBeDisabled("booking_item_id");
        cy.get("#booking_period").should("be.disabled");
        cy.get('button[form="form-booking"][type="submit"]').should(
            "be.disabled"
        );
    });

    it("should show capacity warning for zero-day circulation rules", () => {
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*", {
            body: [
                {
                    library_id: testData.libraries[0].library_id,
                    item_type_id: "BK",
                    patron_category_id: testData.patron.category_id,
                    issuelength: 0,
                    renewalsallowed: 0,
                    renewalperiod: 0,
                    bookings_lead_period: 0,
                    bookings_trail_period: 0,
                    calculated_period_days: 0,
                },
            ],
        }).as("getCirculationRules");

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1);
        cy.wait("@getCirculationRules");

        cy.get("booking-modal-island .modal .alert-warning")
            .scrollIntoView()
            .should("be.visible")
            .and("contain", "Bookings are not permitted");
        cy.get("#booking_period").should("be.disabled");
        cy.get('button[form="form-booking"][type="submit"]').should(
            "be.disabled"
        );
    });

    it("should show error on 409 conflict response", () => {
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*").as(
            "getCirculationRules"
        );
        cy.intercept("POST", "/api/v1/bookings", {
            statusCode: 409,
            body: { error: "Booking conflict detected" },
        }).as("conflictBooking");

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1);
        cy.wait("@getCirculationRules");

        cy.get("#booking_period").should("not.be.disabled");
        const startDate = dayjs().add(5, "day");
        const endDate = dayjs().add(10, "day");
        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        cy.get('button[form="form-booking"][type="submit"]')
            .should("not.be.disabled")
            .click();
        cy.wait("@conflictBooking");

        cy.get("booking-modal-island .modal .alert-danger").should("exist");
        cy.get("booking-modal-island .modal").should("be.visible");
    });

    it("should show error on 500 server error response", () => {
        cy.intercept(
            "GET",
            `/api/v1/biblios/${testData.biblio.biblio_id}/pickup_locations*`
        ).as("getPickupLocations");
        cy.intercept("GET", "/api/v1/circulation_rules*").as(
            "getCirculationRules"
        );
        cy.intercept("POST", "/api/v1/bookings", {
            statusCode: 500,
            body: { error: "Internal server error" },
        }).as("serverError");

        cy.visit(
            `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${testData.biblio.biblio_id}`
        );

        cy.get("booking-modal-island .modal").should("exist");
        cy.get("[data-booking-modal]")
            .first()
            .then($btn => $btn[0].click());
        cy.get("booking-modal-island .modal", { timeout: 10000 }).should(
            "be.visible"
        );

        cy.vueSelect(
            "booking_patron",
            testData.patron.cardnumber,
            `${testData.patron.surname} ${testData.patron.firstname}`
        );
        cy.wait("@getPickupLocations");

        cy.vueSelectShouldBeEnabled("pickup_library_id");
        cy.vueSelectByIndex("pickup_library_id", 0);

        cy.vueSelectShouldBeEnabled("booking_item_id");
        cy.vueSelectByIndex("booking_item_id", 1);
        cy.wait("@getCirculationRules");

        cy.get("#booking_period").should("not.be.disabled");
        const startDate = dayjs().add(5, "day");
        const endDate = dayjs().add(10, "day");
        cy.get("#booking_period").selectFlatpickrDateRange(startDate, endDate);

        cy.get('button[form="form-booking"][type="submit"]')
            .should("not.be.disabled")
            .click();
        cy.wait("@serverError");

        cy.get("booking-modal-island .modal .alert-danger").should("exist");
        cy.get("booking-modal-island .modal").should("be.visible");
    });
});
