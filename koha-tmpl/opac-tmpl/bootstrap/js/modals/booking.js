/// <reference types="dayjs" />
/// <reference types="flatpickr" />
/// <reference types="jquery" />

/**
 * Initializes a modal associated with bookings. Can be used to add, update, or delete bookings.
 * @param {{ patronId?: string, patronCategoryId?: string }} patron - Patron details including optional ID and category ID.
 * @param {Record<"biblioIdSelector" | "endDateSelector" | "formSelector" | "itemIdSelector" | "modalSelector" | "periodPickerSelector" | "pickupLibraryIdSelector" | "endDateSelector", string>} selectors - Object containing the necessary DOM selectors.
 * @param { dataTable } dataTable
 */
async function initBookingsModal(
    { patronId, patronCategoryId } = {},
    {
        biblioIdSelector,
        endDateSelector,
        formSelector,
        itemIdSelector,
        modalSelector,
        periodPickerSelector,
        pickupLibraryIdSelector,
        startDateSelector,
    },
    dataTable = null
) {
    const bookingBiblioId = document.querySelector(biblioIdSelector).value;

    try {
        const preparationDays = [0, 0];
        const bookableItems = await getBiblioBookableItems(bookingBiblioId);
        const bookings = await getBiblioBookings(bookingBiblioId);
        /*
        const biblioItemsAvailability = await getBiblioItemsAvailability(
            patronId,
            bookableItems
        );
        */

        initPeriodPicker(periodPickerSelector, bookings, bookableItems);

        initSelect2(pickupLibraryIdSelector, {
            id: "library_id",
            text: "name",
            url: "/api/v1/public/libraries?_per_page=-1",
            wrapper: "#pickup-library-id-wrapper",
        });

        initSelect2(itemIdSelector, {
            id: "item_id",
            text: "external_id",
            url: `/api/v1/public/biblios/${bookingBiblioId}/items?_per_page=-1&bookable=1`,
            wrapper: "#item-id-wrapper",
        });

        document
            .querySelector(formSelector)
            .addEventListener("submit", e => handleSubmit(e, dataTable));

        document
            .querySelector(periodPickerSelector)
            .addEventListener("change", e =>
                handlePeriodChange(e, [startDateSelector, endDateSelector])
            );

        document
            .querySelector(periodPickerSelector)
            ._flatpickr.calendarContainer.addEventListener("mouseover", e =>
                handleMouseOver(e, periodPickerSelector, preparationDays)
            );

        document
            .querySelector(pickupLibraryIdSelector)
            .addEventListener("select2:select", () =>
                handleSelect2Select([], itemIdSelector)
            );

        document
            .querySelector(itemIdSelector)
            .addEventListener("select2:select", () =>
                handleSelect2Select([], pickupLibraryIdSelector)
            );

        document
            .querySelector(pickupLibraryIdSelector)
            .addEventListener("change.select2", handleChangeSelect2);

        document
            .querySelector(itemIdSelector)
            .addEventListener("change.select2", handleChangeSelect2);

        document
            .querySelector(modalSelector)
            .addEventListener("hidden.bs.modal", () =>
                handleClose(
                    periodPickerSelector,
                    pickupLibraryIdSelector,
                    itemIdSelector
                )
            );
    } catch (error) {
        console.error(error);
    }
}

async function getBiblioBookableItems(biblioId) {
    const biblioBookableItems = await fetch(
        `/api/v1/public/biblios/${biblioId}/items`,
        { params: { bookable: 1, _per_page: -1 } }
    );
    return biblioBookableItems.json();
}

async function getBiblioBookings(biblioId) {
    const biblioBookings = await fetch(
        `/api/v1/public/biblios/${biblioId}/bookings`,
        { params: { _per_page: -1 } }
    );
    return biblioBookings.json();
}

async function getBiblioItemsAvailability(patronId, bookableItems) {
    const promises = bookableItems.map(async item => {
        const response = await fetch(`/api/v1/public/checkouts/availability`, {
            params: { patron_id: patronId, item_id: item.item_id },
        });

        return response.json();
    });

    const results = await Promise.all(promises);
    const biblioBookings = results.reduce((acc, { blockers, warnings }) => {
        const booking = warnings["BOOKED"];
        if (!booking) {
        }

        acc.push();
    }, []);

    console.log(biblioBookings);

    return biblioBookings;
}

async function getCirculationRules(patronCategoryId, itemTypeId, libraryId) {
    try {
        const response = await fetch("/api/v1/public/circulation_rules", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            params: {
                patron_category_id: patronCategoryId,
                item_type_id: itemTypeId,
                library_id: libraryId,
                rules: "bookings_lead_period,bookings_trail_period",
            },
        });

        if (!response.ok) {
            return { leadDays: 0, trailDays: 0 };
        }

        const [rules] = await response.json();
        const leadDays = rules.bookings_lead_period;
        const trailDays = rules.bookings_trail_period;

        return { leadDays, trailDays };
    } catch (error) {
        return { leadDays: 0, trailDays: 0 };
    }
}

function initPeriodPicker(selector, bookings, bookableItems) {
    const periodPicker = document.querySelector(selector)._flatpickr;
    if (!periodPicker) {
        return;
    }

    periodPicker.set("mode", "range");

    hasFunction(periodPicker.config.disable, "dateDisable")?.push(
        function dateDisable(date) {
            const selectedDates = periodPicker.selectedDates;
            if (isBefore(date, selectedDates)) {
                return true;
            }

            let booked = 0;
            const unavailableItems = [];
            const biblioLevelBookings = [];
            const [selectedStart] = selectedDates;
            bookings.forEach(booking => {
                const bookingDates = parseDatesWith(
                    flatpickr.parseDate,
                    bookingDatesTuple(booking)
                );
                if (
                    !selectedStart &&
                    wouldClash(date, "overlap", bookingDates)
                ) {
                    const selectedItem =
                        document.getElementById("booking-item-id");
                    const isSelectedItem = selectedItem === booking.item_id;
                    if (isSelectedItem) {
                        return true;
                    }

                    booked++;
                    if (booked === bookableItems.length) {
                        return true;
                    }
                }

                const isUnavailable =
                    wouldClash(selectedStart, "within", bookingDates) ||
                    wouldClash(date, "within", bookingDates) ||
                    wouldClash([selectedStart, date], "overlap", bookingDates);
                if (isUnavailable) {
                    markAsUnavailable(
                        booking,
                        unavailableItems,
                        biblioLevelBookings
                    );
                }
            });

            return (
                calculateTotalAvailable(
                    bookableItems,
                    unavailableItems,
                    biblioLevelBookings
                ) <= 0
            );
        }
    );

    hasFunction(periodPicker.config.onChange, "periodChange")?.push(
        function periodChange(selectedDates) {
            if (selectedDates.some(date => !date)) {
                return;
            }

            const [selectedStart, selectedEnd] = parseDatesWith(
                dayjs,
                selectedDates
            );
            const bookedItems = bookings.filter(booking => {
                const [startDate, endDate] = parseDatesWith(
                    flatpickr.parseDate,
                    bookingDatesTuple(booking)
                );

                if (endDate <= selectedStart) {
                    return false;
                }

                if (startDate >= selectedEnd) {
                    return false;
                }

                return true;
            });
        }
    );

    hasFunction(periodPicker.config.onDayCreate, "dayCreate")?.push(
        function dayCreate(_, __, ___, dayElem) {
            const [currentDateString] = dayElem.dateObj
                .toISOString()
                .split("T");
            const bookingsMap = mapBookings(bookings);
            if (!bookingsMap.has(currentDateString)) {
                return;
            }

            const dots = document.createElement("span");
            dots.className = "event-dots";
            dayElem.appendChild(dots);

            bookingsMap.get(currentDateString).forEach(itemId => {
                const dot = document.createElement("span");
                dot.className = `event item_${itemId}`;
                dots.appendChild(dot);
            });
        }
    );

    periodPicker.redraw();
}

function hasFunction(object, functionName) {
    if (object.some(f => f.name === functionName)) {
        return;
    }

    return object;
}

function isBefore(date, selectedDates) {
    const [selectedStart, selectedEnd] = selectedDates;
    return selectedStart && !selectedEnd && selectedStart > date;
}

function parseDatesWith(parser, dates) {
    const [start, end] = dates;
    return [parser(start), parser(end)];
}

function bookingDatesTuple(booking) {
    return [booking.start_date, booking.end_date];
}

function wouldClash(datePair1, type, datePair2) {
    const [startDate2, endDate2] = datePair2;
    if (type === "within") {
        return datePair1 >= startDate2 && datePair1 <= endDate2;
    }

    if (type === "overlap" && !Array.isArray(datePair1)) {
        return datePair1 <= startDate2 && datePair1 >= endDate2;
    }

    const [startDate1, endDate1] = datePair1;
    return startDate1 <= startDate2 && endDate1 >= endDate2;
}

function calculateTotalAvailable(sum, ...minuends) {
    return minuends.reduce((acc, minuend) => acc - minuend.length, sum.length);
}

function markAsUnavailable(booking, unavailableItems, biblioLevelBookings) {
    if (!booking.item_id) {
        if (!biblioLevelBookings.includes(booking.booking_id)) {
            biblioLevelBookings.push(booking.booking_id);
        }

        return;
    }

    if (!unavailableItems.includes(booking.booking_id)) {
        unavailableItems.push(booking.booking_id);
    }
}

function mapBookings(bookings) {
    return bookings.reduce((acc, booking) => {
        const [startDate, endDate] = parseDatesWith(
            flatpickr.parseDate,
            bookingDatesTuple(booking)
        );

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const [currentDateString] = currentDate.toISOString().split("T");
            if (!acc.has(currentDateString)) {
                acc.set(currentDateString, []);
            }

            acc.get(currentDateString).push(booking.item_id);

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return acc;
    }, new Map());
}

function initSelect2(selector, options) {
    const $element = $(selector);
    if (!$element) {
        return;
    }

    $element.select2({
        placeholder: "Please select an option",
        dropdownParent: $(options.wrapper),
        minimumResultsForSearch: 20,
        width: "50%",
        dropdownAutoWidth: true,
        allowClear: true,
        ajax: {
            url: options.url,
            data(params) {
                const _params = { ...params, q: params.term };

                delete _params._type;
                delete _params.term;
                return _params;
            },
            dataType: "json",
            processResults(data) {
                return {
                    results: data.map(datum => ({
                        id: datum[options.id],
                        text: datum[options.text],
                    })),
                };
            },
            error(_, __, error) {
                console.error("Error fetching data: ", error);
            },
        },
    });
}

async function handleSubmit(e, dataTable) {
    e.preventDefault();
    const bookingAddForm = e.target;
    const formData = new FormData(bookingAddForm);
    const data = Object.fromEntries(formData.entries());

    try {
        let response, result;
        response = await fetch("/api/v1/public/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            return;
        }

        result = await response.json();

        handleReset(`#${bookingAddForm.id}`);

        dataTable?.api().ajax.reload();
    } catch (error) {
        console.error(error);
    }
}

/**
 * Handles updating the elements that should be mapped to the period picker.
 * @param {Event} e
 * @param {Array<string>} selectors
 */
function handlePeriodChange(e, selectors) {
    const periodInput = e.target;
    if (!(periodInput instanceof HTMLInputElement)) {
        return;
    }

    const periodPicker = periodInput._flatpickr;
    if (!periodPicker) {
        return;
    }

    const selectedDates = periodPicker.selectedDates;
    const [startDate, endDate] = parseDatesWith(dayjs, selectedDates);

    const hiddenInputs = document.querySelectorAll(selectors);
    if (!hiddenInputs) {
        return;
    }

    const [hiddenStartDateInput, hiddenEndDateInput] = Array.from(hiddenInputs);
    hiddenStartDateInput.value = startDate.toISOString();
    hiddenEndDateInput.value = endDate.endOf("day").toISOString();
}

function handleMouseOver(e, selector, preparationDays) {
    const target = e.target;
    if (!target.classList.contains("flatpickr-day")) {
        return;
    }

    const periodPicker = document.querySelector(selector)?._flatpickr;
    if (!periodPicker) {
        return;
    }

    const [selectedStart] = periodPicker.selectedDates;
    const [hoverDate, startDate] = parseDatesWith(dayjs, [
        target.dateObj,
        selectedStart,
    ]).map(date => date?.startOf("day") ?? null);

    const [leadDays, trailDays] = preparationDays;
    const leadStart =
        startDate?.subtract(leadDays, "day") ??
        hoverDate.subtract(leadDays, "day");
    const leadEnd = startDate ?? hoverDate;

    const trailStart = hoverDate;
    const trailEnd = hoverDate.add(trailDays, "day");

    let leadDisable = false;
    let trailDisable = false;
    periodPicker.calendarContainer
        .querySelectorAll(".flatpickr-day")
        .forEach(dayElem => {
            const elemDate = dayjs(dayElem.dateObj).startOf("day");
            new Map([
                ["leadRangeStart", elemDate.isSame(leadStart)],
                [
                    "leadRange",
                    elemDate.isSameOrAfter(leadStart) &&
                        elemDate.isBefore(leadEnd),
                ],
                ["leadRangeEnd", elemDate.isSame(leadEnd)],
                ["trailRangeStart", elemDate.isSame(trailStart)],
                [
                    "trailRange",
                    elemDate.isAfter(trailStart) &&
                        elemDate.isSameOrBefore(trailEnd),
                ],
                ["trailRangeEnd", elemDate.isSame(trailEnd)],
            ]).forEach((expression, cssClass) => {
                if (!expression) {
                    return;
                }

                dayElem.classList.toggle(cssClass);
            });

            if (dayElem.classList.contains("flatpickr-disabled")) {
                const hasLeadingOverlap =
                    selectedStart &&
                    elemDate.isSameOrAfter(leadStart) &&
                    elemDate.isBefore(leadEnd);
                if (hasLeadingOverlap) {
                    leadDisable = true;
                }

                const hasTrailingOverlap =
                    elemDate.isAfter(trailStart) &&
                    elemDate.isSameOrBefore(trailEnd);
                if (hasTrailingOverlap) {
                    trailDisable = true;
                }
            }

            dayElem.classList.remove("leadDisable");
            dayElem.classList.remove("trailDisable");
            dayElem.removeEventListener("click", disableClick, true);
        });

    if (leadDisable) {
        target.classList.add("leadDisable");
    }
    if (trailDisable) {
        target.classList.add("trailDisable");
    }

    if (trailDisable || leadDisable) {
        target.addEventListener("click", disableClick, true);
    }
}

function disableClick(e) {
    e.stopImmediatePropagation();
}

async function handleSelect2Select(data, targetSelector) {
    console.log("handleSelect2Select");
    const element = document.querySelector(targetSelector);
    const options = document.querySelectorAll(`${element.id} > option`);
    options.forEach(option => {
        option.disabled = data.includes(option.value);
    });

    element.dispatchEvent(new CustomEvent("change.select2"));
}

function handleChangeSelect2() {
    console.log("handleChangeSelect2");
}

function handleReset(selector) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLFormElement)) {
        return;
    }

    element.reset();
    $(element.closest(".modal"))?.modal("hide");
}

/**
 * Handles the closing and resetting of provided selectors.
 *
 * This function clears Flatpickr instances for any selector that contains "period", resets the value of the selectors,
 * triggers a "change" event, and disables all but the first selector.
 *
 * @param {...string} selectors - A list of CSS selectors to handle.
 */
function handleClose(...selectors) {
    selectors.forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) {
            return;
        }

        if (selector.includes("period")) {
            element._flatpickr.clear();
        }

        element.value = "";
        element.dispatchEvent(new Event("change"));
        element.innerHTML = "";
        element.disabled = false;
    });
}
