import { win } from "./globals.js";
import { transformPatronData } from "./patron.js";
import dayjs from "../../../../utils/dayjs.js";
import { $__ } from "../../../../i18n/index.js";

/** @typedef {import('../../types/bookings').ExternalDependencies} ExternalDependencies */

/**
 * Default dependencies for external updates - can be overridden in tests
 * @type {ExternalDependencies}
 */
const defaultDependencies = {
    timeline: () => win("timeline"),
    bookingsTable: () => win("bookings_table"),
    patronRenderer: () => win("$patron_to_html"),
    domQuery: selector => document.querySelectorAll(selector),
    logger: {
        warn: (msg, data) => console.warn(msg, data),
        error: (msg, error) => console.error(msg, error),
    },
};

/**
 * Renders patron content for display, with injected dependency
 *
 * @param {{ cardnumber?: string }|null} bookingPatron
 * @param {ExternalDependencies} [dependencies=defaultDependencies]
 * @returns {string}
 */
function renderPatronContent(
    bookingPatron,
    dependencies = defaultDependencies
) {
    try {
        const patronRenderer = dependencies.patronRenderer();
        if (typeof patronRenderer === "function" && bookingPatron) {
            return patronRenderer(bookingPatron, {
                display_cardnumber: true,
                url: true,
            });
        }

        if (bookingPatron) {
            const transformed = transformPatronData(bookingPatron);
            return transformed?.label || bookingPatron.cardnumber || "";
        }

        return "";
    } catch (error) {
        dependencies.logger.error("Failed to render patron content", {
            error,
            bookingPatron,
        });
        const transformed = transformPatronData(bookingPatron);
        return transformed?.label || bookingPatron?.cardnumber || "";
    }
}

/**
 * Updates timeline component with booking data
 *
 * @param {import('../../types/bookings').Booking} newBooking
 * @param {{ cardnumber?: string }|null} bookingPatron
 * @param {boolean} isUpdate
 * @param {ExternalDependencies} dependencies
 * @returns {{ success: boolean, reason?: string }}
 */
function updateTimelineComponent(
    newBooking,
    bookingPatron,
    isUpdate,
    dependencies
) {
    const timeline = dependencies.timeline();
    if (!timeline) return { success: false, reason: "Timeline not available" };

    try {
        const timezoneFn = win("$timezone");
        const tz = typeof timezoneFn === "function" ? timezoneFn() : null;
        const startDayjs =
            tz && dayjs.tz
                ? dayjs(newBooking.start_date).tz(tz)
                : dayjs(newBooking.start_date);
        const endDayjs =
            tz && dayjs.tz
                ? dayjs(newBooking.end_date).tz(tz)
                : dayjs(newBooking.end_date);

        const itemData = {
            id: newBooking.booking_id,
            booking: newBooking.booking_id,
            patron: newBooking.patron_id,
            start: startDayjs.toDate(),
            end: endDayjs.toDate(),
            content: renderPatronContent(bookingPatron, dependencies),
            editable: { remove: true, updateTime: true },
            type: "range",
            group: newBooking.item_id ? newBooking.item_id : 0,
        };

        if (isUpdate) {
            timeline.itemsData.update(itemData);
        } else {
            timeline.itemsData.add(itemData);
        }
        timeline.focus(newBooking.booking_id);

        return { success: true };
    } catch (error) {
        dependencies.logger.error("Failed to update timeline", {
            error,
            newBooking,
        });
        return { success: false, reason: error.message };
    }
}

/**
 * Updates bookings table component
 *
 * @param {ExternalDependencies} dependencies
 * @returns {{ success: boolean, reason?: string }}
 */
function updateBookingsTable(dependencies) {
    const bookingsTable = dependencies.bookingsTable();
    if (!bookingsTable)
        return { success: false, reason: "Bookings table not available" };

    try {
        bookingsTable.api().ajax.reload();
        return { success: true };
    } catch (error) {
        dependencies.logger.error("Failed to update bookings table", { error });
        return { success: false, reason: error.message };
    }
}

/**
 * Updates booking count elements in the DOM
 *
 * @param {boolean} isUpdate
 * @param {ExternalDependencies} dependencies
 * @returns {{ success: boolean, reason?: string, updatedElements?: number, totalElements?: number }}
 */
function updateBookingCounts(isUpdate, dependencies) {
    if (isUpdate)
        return { success: true, reason: "No count update needed for updates" };

    try {
        const countEls = dependencies.domQuery(".bookings_count");
        let updatedCount = 0;

        countEls.forEach(el => {
            const current = el.textContent.match(/(\d+)/);
            if (current) {
                el.textContent = el.textContent.replace(
                    /(\d+)/,
                    String(parseInt(current[1], 10) + 1)
                );
                updatedCount++;
            }
        });

        return {
            success: true,
            updatedElements: updatedCount,
            totalElements: countEls.length,
        };
    } catch (error) {
        dependencies.logger.error("Failed to update booking counts", { error });
        return { success: false, reason: error.message };
    }
}

/**
 * Shows a transient success message in the #transient_result element
 *
 * @param {boolean} isUpdate - Whether this was an update or create
 * @param {ExternalDependencies} dependencies
 * @returns {{ success: boolean, reason?: string }}
 */
function showTransientSuccess(isUpdate, dependencies) {
    try {
        const container = dependencies.domQuery("#transient_result");
        if (!container || container.length === 0) {
            return {
                success: false,
                reason: "Transient result container not found",
            };
        }

        const msg = isUpdate
            ? $__("Booking successfully updated")
            : $__("Booking successfully placed");

        const el = container[0] || container;
        const alert = document.createElement("div");
        alert.className = "alert alert-success alert-dismissible fade show";
        alert.setAttribute("role", "alert");
        alert.textContent = msg;
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-close";
        closeBtn.setAttribute("data-bs-dismiss", "alert");
        closeBtn.setAttribute("aria-label", "Close");
        alert.appendChild(closeBtn);
        el.replaceChildren(alert);

        return { success: true };
    } catch (error) {
        dependencies.logger.error("Failed to show transient success", {
            error,
        });
        return { success: false, reason: error.message };
    }
}

/**
 * Updates external components that depend on booking data
 *
 * This function is designed with dependency injection to make it testable
 * and to provide proper error handling with detailed feedback.
 *
 * @param {import('../../types/bookings').Booking} newBooking - The booking data that was created/updated
 * @param {{ cardnumber?: string }|null} bookingPatron - The patron data for rendering
 * @param {boolean} isUpdate - Whether this is an update (true) or create (false)
 * @param {ExternalDependencies} dependencies - Injectable dependencies (for testing)
 * @returns {Record<string, { attempted: boolean, success?: boolean, reason?: string }>} Results summary with success/failure details
 */
export function updateExternalDependents(
    newBooking,
    bookingPatron,
    isUpdate = false,
    dependencies = defaultDependencies
) {
    const results = {
        timeline: { attempted: false },
        bookingsTable: { attempted: false },
        bookingCounts: { attempted: false },
        transientSuccess: { attempted: false },
    };

    if (dependencies.timeline()) {
        results.timeline = {
            attempted: true,
            ...updateTimelineComponent(
                newBooking,
                bookingPatron,
                isUpdate,
                dependencies
            ),
        };
    }

    if (dependencies.bookingsTable()) {
        results.bookingsTable = {
            attempted: true,
            ...updateBookingsTable(dependencies),
        };
    }

    results.bookingCounts = {
        attempted: true,
        ...updateBookingCounts(isUpdate, dependencies),
    };

    results.transientSuccess = {
        attempted: true,
        ...showTransientSuccess(isUpdate, dependencies),
    };

    return results;
}
