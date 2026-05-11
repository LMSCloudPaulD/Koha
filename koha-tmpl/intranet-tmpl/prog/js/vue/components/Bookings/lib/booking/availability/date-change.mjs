/**
 * Date change handlers for booking availability.
 * @module availability/date-change
 */

import { BookingDate, isoArrayToDates } from "../BookingDate.mjs";
import { createConstraintStrategy } from "../strategies.mjs";
import { buildIntervalTree } from "../algorithms/interval-tree.mjs";
import { CONSTRAINT_MODE_END_DATE_ONLY } from "../constants.mjs";
import { calculateDisabledDates } from "./disabled-dates.mjs";
import { deriveEffectiveRules, calculateMaxBookingPeriod } from "./rules.mjs";
import { calculateMaxEndDate } from "./period-validators.mjs";
import {
    queryRangeAndResolve,
    createConflictContext,
} from "../conflict-resolution.mjs";

const $__ = globalThis.$__ || (str => str);

/**
 * Find the first date where a booking range [startDate, candidateEnd] would conflict
 * with all items. This mirrors the backend's range-overlap detection logic.
 *
 * The backend considers two bookings overlapping if:
 * - existing.start_date BETWEEN new.start AND new.end (inclusive)
 * - existing.end_date BETWEEN new.start AND new.end (inclusive)
 * - existing completely wraps new
 *
 * @param {Date|import('dayjs').Dayjs} startDate - Start of the booking range
 * @param {Date|import('dayjs').Dayjs} endDate - Maximum end date to check
 * @param {Array} bookings - Array of booking objects
 * @param {Array} checkouts - Array of checkout objects
 * @param {Array} bookableItems - Array of bookable items
 * @param {string|number|null} selectedItem - Selected item ID or null for "any item"
 * @param {string|number|null} editBookingId - Booking ID being edited (to exclude)
 * @param {Object} circulationRules - Circulation rules for lead/trail periods
 * @returns {{ firstBlockingDate: Date|null, reason: string|null }} The first date that would cause all items to conflict
 */
export function findFirstBlockingDate(
    startDate,
    endDate,
    bookings,
    checkouts,
    bookableItems,
    selectedItem,
    editBookingId,
    circulationRules = {}
) {
    if (!bookableItems || bookableItems.length === 0) {
        return {
            firstBlockingDate: BookingDate.from(startDate).toDate(),
            reason: "no_items",
        };
    }

    const intervalTree = buildIntervalTree(
        bookings,
        checkouts,
        circulationRules
    );
    const allItemIds = bookableItems.map(i => String(i.item_id));
    const ctx = createConflictContext(selectedItem, editBookingId, allItemIds);

    const start = BookingDate.from(startDate).toDayjs();
    const end = BookingDate.from(endDate).toDayjs();

    // For each potential end date, check if the range [start, candidateEnd] would have at least one available item
    for (
        let candidateEnd = start.add(1, "day");
        candidateEnd.isSameOrBefore(end, "day");
        candidateEnd = candidateEnd.add(1, "day")
    ) {
        const result = queryRangeAndResolve(
            intervalTree,
            start.valueOf(),
            candidateEnd.valueOf(),
            ctx
        );

        if (result.hasConflict) {
            return {
                firstBlockingDate: candidateEnd.toDate(),
                reason: ctx.selectedItem
                    ? result.conflicts[0]?.type || "conflict"
                    : "all_items_have_conflicts",
            };
        }
    }

    return { firstBlockingDate: null, reason: null };
}

/**
 * Convenience wrapper to calculate availability (disable fn + map) given a dateRange.
 * Accepts an array of Date objects or ISO date values for dateRange.
 * @returns {import('../../../types/bookings').AvailabilityResult}
 */
export function calculateAvailabilityData(dateRange, storeData, options = {}) {
    const {
        bookings,
        checkouts,
        bookableItems,
        circulationRules,
        bookingItemId,
        bookingId,
    } = storeData;

    if (!bookings || !checkouts || !bookableItems) {
        return { disable: () => false, unavailableByDate: {} };
    }

    const baseRules = circulationRules?.[0] || {};
    const maxBookingPeriod = calculateMaxBookingPeriod(
        circulationRules,
        options.dateRangeConstraint,
        options.customDateRangeFormula
    );
    const effectiveRules = deriveEffectiveRules(baseRules, {
        dateRangeConstraint: options.dateRangeConstraint,
        maxBookingPeriod,
    });

    let selectedDatesArray = [];
    if (Array.isArray(dateRange)) {
        selectedDatesArray = isoArrayToDates(dateRange);
    } else if (typeof dateRange === "string") {
        throw new TypeError(
            "calculateAvailabilityData expects an array of ISO/date values for dateRange"
        );
    }

    return calculateDisabledDates(
        bookings,
        checkouts,
        bookableItems,
        bookingItemId,
        bookingId,
        selectedDatesArray,
        effectiveRules
    );
}

/**
 * Pure function to validate booking period selection.
 * Determines the valid end date range, applies circulation rules, and returns validation info.
 *
 * @param {Array} selectedDates - Array of currently selected dates ([start], or [start, end])
 * @param {Object} circulationRules - Circulation rules object (leadDays, trailDays, maxPeriod, etc.)
 * @param {Array} bookings - Array of bookings
 * @param {Array} checkouts - Array of checkouts
 * @param {Array} bookableItems - Array of all bookable items
 * @param {number|string|null} selectedItem - The currently selected item
 * @param {number|string|null} editBookingId - The booking_id being edited (if any)
 * @param {Date|import('dayjs').Dayjs} todayArg - Optional today value for deterministic tests
 * @returns {Object} - { valid: boolean, errors: Array<string>, newMaxEndDate: Date|null, newMinEndDate: Date|null }
 */
export function handleBookingDateChange(
    selectedDates,
    circulationRules,
    bookings,
    checkouts,
    bookableItems,
    selectedItem,
    editBookingId,
    todayArg = undefined,
    options = {}
) {
    const dayjsStart = selectedDates[0]
        ? BookingDate.from(selectedDates[0]).toDayjs()
        : null;
    const dayjsEnd = selectedDates[1]
        ? BookingDate.from(selectedDates[1], { preserveTime: true }).toDayjs().endOf("day")
        : null;
    const errors = [];
    let valid = true;
    let newMaxEndDate = null;
    let newMinEndDate = null;

    // Validate: ensure start date is present
    if (!dayjsStart) {
        errors.push(String($__("Start date is required.")));
        valid = false;
    } else {
        // Apply circulation rules: leadDays, maxPeriod (in days)
        const leadDays = circulationRules?.leadDays || 0;
        const maxPeriod =
            Number(circulationRules?.maxPeriod) ||
            Number(circulationRules?.issuelength) ||
            0;

        // Calculate min end date; max end date only when constrained
        newMinEndDate = dayjsStart.add(1, "day").startOf("day");
        if (maxPeriod > 0) {
            newMaxEndDate = calculateMaxEndDate(dayjsStart, maxPeriod).startOf(
                "day"
            );
        } else {
            newMaxEndDate = null;
        }

        // Validate: start must be after today + leadDays
        const today = todayArg
            ? BookingDate.from(todayArg).toDayjs()
            : BookingDate.today().toDayjs();
        if (dayjsStart.isBefore(today.add(leadDays, "day"))) {
            errors.push(
                String($__("Start date is too soon (lead time required)"))
            );
            valid = false;
        }

        // Validate: end must not be before start (only if end date exists)
        if (dayjsEnd && dayjsEnd.isBefore(dayjsStart)) {
            errors.push(String($__("End date is before start date")));
            valid = false;
        }

        // Validate: period must not exceed maxPeriod unless overridden in end_date_only by backend due date
        if (dayjsEnd) {
            const isEndDateOnly =
                circulationRules?.booking_constraint_mode ===
                CONSTRAINT_MODE_END_DATE_ONLY;
            const dueStr = circulationRules?.calculated_due_date;
            const hasBackendDue = Boolean(dueStr);
            if (!isEndDateOnly || !hasBackendDue) {
                if (
                    maxPeriod > 0 &&
                    dayjsEnd.diff(dayjsStart, "day") >= maxPeriod
                ) {
                    errors.push(
                        String($__("Booking period exceeds maximum allowed"))
                    );
                    valid = false;
                }
            }
        }

        // Strategy-specific enforcement for end date (e.g., end_date_only)
        const strategy = createConstraintStrategy(
            circulationRules?.booking_constraint_mode
        );
        const enforcement = strategy.enforceEndDateSelection(
            dayjsStart,
            dayjsEnd,
            circulationRules
        );
        if (!enforcement.ok) {
            errors.push(
                String(
                    $__(
                        "In end date only mode, you can only select the calculated end date"
                    )
                )
            );
            valid = false;
        }

        // Validate: check for booking/checkouts overlap using calculateDisabledDates
        // This check is only meaningful if we have at least a start date,
        // and if an end date is also present, we check the whole range.
        // If only start date, effectively checks that single day.
        const endDateForLoop = dayjsEnd || dayjsStart; // If no end date, loop for the start date only

        const disableFnResults = calculateDisabledDates(
            bookings,
            checkouts,
            bookableItems,
            selectedItem,
            editBookingId,
            selectedDates,
            circulationRules,
            todayArg,
            options
        );
        for (
            let d = dayjsStart.clone();
            d.isSameOrBefore(endDateForLoop, "day");
            d = d.add(1, "day")
        ) {
            if (disableFnResults.disable(d.toDate())) {
                errors.push(
                    String(
                        $__("Date %s is unavailable.").format(
                            d.format("YYYY-MM-DD")
                        )
                    )
                );
                valid = false;
                break;
            }
        }
    }

    return {
        valid,
        errors,
        newMaxEndDate: newMaxEndDate ? newMaxEndDate.toDate() : null,
        newMinEndDate: newMinEndDate ? newMinEndDate.toDate() : null,
    };
}
