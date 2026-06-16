/**
 * Translate booking domain state into the Maps and functions that
 * BookingFlatpickr consumes: disabledFn, disabledByDate, markersByDate,
 * classByDate, rangePreviewFn, loanBoundaryTimes.
 *
 * @module composables/useBookingCalendarMaps
 */

import { computed } from "vue";
import { BookingDate, isoArrayToDates } from "../lib/booking/BookingDate.js";
import { buildIntervalTree } from "../lib/booking/algorithms/interval-tree.js";
import {
    buildUnavailableByDateMap,
    addHolidayMarkers,
} from "../lib/booking/availability/unavailable-map.js";
import { calculateMaxEndDate } from "../lib/booking/availability/period-validators.js";
import { createDisableFunction } from "../lib/booking/availability/disabled-dates.js";
import { findFirstBlockingDate } from "../lib/booking/availability/date-change.js";
import {
    extractBookingConfiguration,
    toEffectiveRules,
} from "../lib/booking/availability/rules.js";
import { getBookingMarkersForDate } from "../lib/booking/markers.js";
import {
    CLASS_BOOKING_CONSTRAINED_RANGE_MARKER,
    CLASS_BOOKING_INTERMEDIATE_BLOCKED,
    CLASS_BOOKING_LOAN_BOUNDARY,
    CONSTRAINT_MODE_END_DATE_ONLY,
} from "../lib/booking/constants.js";
import { $__ } from "../../../i18n/index.js";

/**
 * @param {Object} inputs
 * @param {import("vue").Ref<Array>} inputs.bookableItems
 * @param {import("vue").Ref<Array>} inputs.bookings
 * @param {import("vue").Ref<Array>} inputs.checkouts
 * @param {import("vue").Ref<Array<string>>} inputs.holidays
 * @param {import("vue").Ref<string|number|null>} inputs.editBookingId
 * @param {import("vue").Ref<string[]>} [inputs.selectedDateRange] - ISO[] of currently selected start/end
 * @param {import("vue").Ref<Object>} [inputs.constraintOptions] - dateRangeConstraint, maxBookingPeriod, etc.
 * @param {import("vue").Ref<{start: Date, end: Date} | null>} [inputs.visibleRange]
 * @param {import("vue").Ref<Date|null>} [inputs.rangeAnchor]
 * @param {import("vue").Ref<number|null>} [inputs.maxBookingPeriod]
 * @param {import("vue").Ref<string|number|null>} [inputs.bookingItemId]
 * @param {import("vue").Ref<string|number|null>} [inputs.bookingItemtypeId]
 * @param {import("vue").Ref<Array>} [inputs.circulationRules]
 * @returns {{
 *   disabledFn: import("vue").ComputedRef<(date: Date) => boolean>,
 *   disabledByDate: import("vue").ComputedRef<Map<string, {reason:string,severity:"hard"|"soft"}>>,
 *   markersByDate: import("vue").ComputedRef<Map<string, Array<{kind:string,className:string,tooltip?:string}>>>,
 *   classByDate: import("vue").ComputedRef<Map<string, string>>,
 *   rangePreviewFn: (anchor: Date, hover: Date) => {status:"valid"|"invalid",message?:string},
 *   loanBoundaryTimes: import("vue").ComputedRef<Set<number>>,
 * }}
 */
export function useBookingCalendarMaps({
    bookableItems,
    bookings,
    checkouts,
    holidays,
    editBookingId,
    selectedDateRange,
    constraintOptions,
    visibleRange,
    rangeAnchor,
    maxBookingPeriod,
    bookingItemId,
    bookingItemtypeId,
    circulationRules,
}) {
    const allItemIds = computed(() =>
        (bookableItems.value || []).map(i => String(i.item_id))
    );

    const relevantItemIds = computed(() => {
        const items = bookableItems.value || [];
        const selectedItem = bookingItemId?.value;
        if (selectedItem != null && selectedItem !== "") {
            return [String(selectedItem)];
        }
        const selectedItemtype = bookingItemtypeId?.value;
        if (selectedItemtype != null && selectedItemtype !== "") {
            return items
                .filter(i => {
                    const t = i.effective_item_type_id || i.item_type_id;
                    return String(t) === String(selectedItemtype);
                })
                .map(i => String(i.item_id));
        }
        return items.map(i => String(i.item_id));
    });

    const effectiveRules = computed(() => {
        const rules = circulationRules?.value;
        if (Array.isArray(rules) && rules.length > 0) return rules[0] || {};
        if (rules && typeof rules === "object" && !Array.isArray(rules))
            return rules;
        return {};
    });

    const intervalTree = computed(() =>
        buildIntervalTree(
            bookings.value || [],
            checkouts.value || [],
            effectiveRules.value
        )
    );

    const unavailableByDate = computed(() => {
        const today = BookingDate.today().toDayjs();
        const range = visibleRange?.value;
        const opts = range
            ? {
                  onDemand: true,
                  visibleStartDate: BookingDate.from(range.start).toDayjs(),
                  visibleEndDate: BookingDate.from(range.end).toDayjs(),
              }
            : {};
        const map = buildUnavailableByDateMap(
            intervalTree.value,
            today,
            allItemIds.value,
            editBookingId.value,
            opts
        );
        if (holidays.value && holidays.value.length) {
            addHolidayMarkers(map, holidays.value, allItemIds.value);
        }
        return map;
    });

    const disabledFn = computed(() => {
        const opts = constraintOptions?.value || {};
        const config = extractBookingConfiguration(
            toEffectiveRules(circulationRules?.value, opts),
            undefined
        );
        const selDates = isoArrayToDates(selectedDateRange?.value || []);
        return createDisableFunction(
            intervalTree.value,
            config,
            bookableItems.value || [],
            bookingItemId?.value != null ? String(bookingItemId.value) : null,
            editBookingId?.value != null ? Number(editBookingId.value) : null,
            selDates,
            holidays?.value || []
        );
    });

    // Severity-tagged Map for visualization. disabledFn carries the full
    // validation logic (past dates, lead/trail, range overlap), but its
    // boolean output loses severity. Consumers that need to render
    // soft-disabled affordances (e.g., a holiday during picking-end mode
    // that the range can still cross) read this Map.
    const disabledByDate = computed(() => {
        /** @type {Map<string, {reason:string,severity:"hard"|"soft"}>} */
        const result = new Map();
        const itemIds = relevantItemIds.value;
        const anchor = rangeAnchor?.value ?? null;
        const holidaySet = new Set(holidays.value || []);

        if (itemIds.length > 0) {
            Object.entries(unavailableByDate.value).forEach(
                ([dateKey, byItem]) => {
                    const allBlocked = itemIds.every(id => {
                        const reasons = byItem[id];
                        if (!reasons) return false;
                        return (
                            reasons.has("booking") || reasons.has("checkout")
                        );
                    });
                    if (allBlocked) {
                        result.set(dateKey, {
                            reason: $__("All items unavailable"),
                            severity: "hard",
                        });
                    }
                }
            );
        }

        // Holidays: hard when no anchor, soft when an anchor is set so the
        // range can cross them. A booking-blocked entry already in the map
        // wins (booking unavailability is always hard).
        holidaySet.forEach(dateKey => {
            if (result.has(dateKey)) return;
            result.set(dateKey, {
                reason: $__("Library closed"),
                severity: anchor ? "soft" : "hard",
            });
        });

        // end_date_only mode: every date strictly between the anchor and
        // the calculated target end is soft-disabled. The user can only
        // commit the calculated end (or shrink the range from the anchor
        // side); intermediate clicks shouldn't reset the range. The
        // disable function in createDisableFunction deliberately leaves
        // these enabled so flatpickr's range validator still accepts the
        // [anchor, end] span; the UX is enforced here via soft severity.
        const rules = effectiveRules.value;
        const isEndDateOnly =
            rules?.booking_constraint_mode === CONSTRAINT_MODE_END_DATE_ONLY;
        const maxPeriod = maxBookingPeriod?.value;
        if (isEndDateOnly && anchor && maxPeriod && maxPeriod > 0) {
            const start = BookingDate.from(anchor).toDayjs();
            const targetEnd = start.add(maxPeriod, "day");
            for (
                let d = start.clone().add(1, "day");
                d.isBefore(targetEnd, "day");
                d = d.add(1, "day")
            ) {
                const key = d.format("YYYY-MM-DD");
                const existing = result.get(key);
                if (existing && existing.severity === "hard") continue;
                result.set(key, {
                    reason: $__("Intermediate date in fixed range"),
                    severity: "soft",
                });
            }
        }

        return result;
    });

    const markersByDate = computed(() => {
        /** @type {Map<string, Array<{kind:string,className:string,tooltip?:string}>>} */
        const result = new Map();
        const items = bookableItems.value || [];

        Object.keys(unavailableByDate.value).forEach(dateKey => {
            const markers = getBookingMarkersForDate(
                unavailableByDate.value,
                dateKey,
                items
            );
            if (markers.length === 0) return;
            result.set(
                dateKey,
                markers.map(m => ({
                    kind: m.type,
                    className: `booking-marker-dot--${m.type}`,
                    tooltip: m.itemName,
                }))
            );
        });

        return result;
    });

    /**
     * Loan-period boundary timestamps: anchor, anchor+issuelength, and each
     * renewal-period boundary. Used to apply CLASS_BOOKING_LOAN_BOUNDARY to
     * those days and exposed as a Set so the parent can write it onto the
     * flatpickr instance for tests/legacy consumers that read it directly.
     */
    const loanBoundaryTimes = computed(() => {
        const result = new Set();
        const anchor = rangeAnchor?.value;
        if (!anchor) return result;
        const startDate = BookingDate.from(anchor).toDayjs().startOf("day");
        result.add(startDate.toDate().getTime());
        const rules =
            (Array.isArray(circulationRules?.value)
                ? circulationRules.value[0]
                : circulationRules?.value) ?? {};
        const issuelength = parseInt(rules.issuelength) || 0;
        const renewalperiod = parseInt(rules.renewalperiod) || 0;
        const renewalsallowed = parseInt(rules.renewalsallowed) || 0;
        if (issuelength > 0) {
            result.add(startDate.add(issuelength, "day").toDate().getTime());
            if (renewalperiod > 0 && renewalsallowed > 0) {
                for (let k = 1; k <= renewalsallowed; k++) {
                    result.add(
                        startDate
                            .add(issuelength + k * renewalperiod, "day")
                            .toDate()
                            .getTime()
                    );
                }
            }
        }
        return result;
    });

    const classByDate = computed(() => {
        /** @type {Map<string, string>} */
        const result = new Map();
        const anchor = rangeAnchor?.value;
        const maxPeriod = maxBookingPeriod?.value;

        if (anchor && maxPeriod && maxPeriod > 0) {
            const start = BookingDate.from(anchor).toDayjs();
            let end = calculateMaxEndDate(anchor, maxPeriod);

            // Clamp to actual availability: when all items become unavailable
            // before the theoretical end, stop highlighting at the last day a
            // booking range from the anchor could still be placed. Mirrors the
            // backend's BETWEEN-based overlap detection so the highlight only
            // covers ranges the server would accept.
            const items = bookableItems.value || [];
            if (items.length > 0) {
                const { firstBlockingDate } = findFirstBlockingDate(
                    start,
                    end,
                    bookings.value || [],
                    checkouts.value || [],
                    items,
                    bookingItemId?.value != null
                        ? String(bookingItemId.value)
                        : null,
                    editBookingId?.value != null
                        ? Number(editBookingId.value)
                        : null,
                    effectiveRules.value
                );
                if (firstBlockingDate) {
                    const clampedEnd = BookingDate.from(firstBlockingDate)
                        .toDayjs()
                        .subtract(1, "day");
                    if (clampedEnd.isBefore(end, "day")) {
                        end = clampedEnd;
                    }
                }
            }

            for (
                let d = start.clone();
                d.isSameOrBefore(end, "day");
                d = d.add(1, "day")
            ) {
                result.set(
                    d.format("YYYY-MM-DD"),
                    CLASS_BOOKING_CONSTRAINED_RANGE_MARKER
                );
            }
        }

        // Merge loan-boundary class for anchor + issuelength + each renewal end.
        loanBoundaryTimes.value.forEach(ts => {
            const key = BookingDate.from(new Date(ts))
                .toDayjs()
                .format("YYYY-MM-DD");
            const existing = result.get(key);
            result.set(
                key,
                existing
                    ? `${existing} ${CLASS_BOOKING_LOAN_BOUNDARY}`
                    : CLASS_BOOKING_LOAN_BOUNDARY
            );
        });

        // end_date_only mode: tag intermediate dates within the constrained
        // range so they render distinctly from the regular constrained-range
        // highlight, signalling that those days are inside the fixed span
        // but cannot be clicked.
        const rules = effectiveRules.value;
        const isEndDateOnly =
            rules?.booking_constraint_mode === CONSTRAINT_MODE_END_DATE_ONLY;
        if (isEndDateOnly && anchor && maxPeriod && maxPeriod > 0) {
            const start = BookingDate.from(anchor).toDayjs();
            const targetEnd = start.add(maxPeriod, "day");
            for (
                let d = start.clone().add(1, "day");
                d.isBefore(targetEnd, "day");
                d = d.add(1, "day")
            ) {
                const key = d.format("YYYY-MM-DD");
                const existing = result.get(key);
                result.set(
                    key,
                    existing
                        ? `${existing} ${CLASS_BOOKING_INTERMEDIATE_BLOCKED}`
                        : CLASS_BOOKING_INTERMEDIATE_BLOCKED
                );
            }
        }

        return result;
    });

    function rangePreviewFn(anchor, hover) {
        const a = BookingDate.from(anchor).toDayjs();
        const h = BookingDate.from(hover).toDayjs();

        if (h.isBefore(a, "day")) {
            return {
                status: "invalid",
                message: $__("End date must be on or after the start date"),
            };
        }

        const maxPeriod = maxBookingPeriod?.value;
        const days = h.diff(a, "day") + 1;
        if (maxPeriod && days > maxPeriod) {
            return {
                status: "invalid",
                message: $__(
                    "Range exceeds max booking period (%s days)"
                ).format(maxPeriod),
            };
        }

        const fn = disabledFn.value;
        for (
            let d = a.clone();
            d.isSameOrBefore(h, "day");
            d = d.add(1, "day")
        ) {
            if (fn(d.toDate())) {
                return {
                    status: "invalid",
                    message: $__("Range includes blocked day"),
                };
            }
        }

        return { status: "valid" };
    }

    return {
        disabledFn,
        disabledByDate,
        markersByDate,
        classByDate,
        rangePreviewFn,
        loanBoundaryTimes,
    };
}
