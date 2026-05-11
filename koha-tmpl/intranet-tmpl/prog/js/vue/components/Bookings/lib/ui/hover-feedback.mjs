/**
 * Contextual hover feedback messages for booking calendar dates.
 *
 * Generates user-facing messages explaining why a date is disabled
 * or providing context about the current selection mode.
 * Mirrors upstream's ~20 contextual messages adapted for the Vue architecture.
 *
 * @module hover-feedback
 */

import { BookingDate, formatYMD } from "../booking/BookingDate.mjs";
import { $__ } from "../../../../i18n/index.js";

/**
 * Generate a contextual feedback message for a hovered calendar date.
 *
 * @param {Date} date - The date being hovered
 * @param {Object} context
 * @param {boolean} context.isDisabled - Whether the date is disabled in the calendar
 * @param {string[]} context.selectedDateRange - Currently selected dates (ISO strings)
 * @param {Object} context.circulationRules - First circulation rule object
 * @param {Object} context.unavailableByDate - Unavailability map from store
 * @param {string[]} [context.holidays] - Holiday date strings (YYYY-MM-DD)
 * @returns {{ message: string, variant: "info"|"warning"|"danger" } | null}
 */
export function getDateFeedbackMessage(date, context) {
    const {
        isDisabled,
        selectedDateRange,
        circulationRules,
        unavailableByDate,
        holidays,
    } = context;

    const today = BookingDate.today().toDayjs();
    const d = BookingDate.from(date).toDayjs();
    const dateKey = formatYMD(date);

    const leadDays = Number(circulationRules?.bookings_lead_period) || 0;
    const trailDays = Number(circulationRules?.bookings_trail_period) || 0;
    const maxPeriod =
        Number(circulationRules?.maxPeriod) ||
        Number(circulationRules?.issuelength) ||
        0;

    const hasStart = selectedDateRange && selectedDateRange.length >= 1;
    const isSelectingEnd = hasStart;
    const isSelectingStart = !hasStart;

    if (isDisabled) {
        const reason = getDisabledReason(d, dateKey, {
            today,
            leadDays,
            trailDays,
            maxPeriod,
            isSelectingStart,
            isSelectingEnd,
            selectedDateRange,
            unavailableByDate,
            holidays,
        });
        return { message: reason, variant: "danger" };
    }

    const info = getEnabledInfo({
        leadDays,
        trailDays,
        isSelectingStart,
        isSelectingEnd,
        unavailableByDate,
        dateKey,
    });
    return info ? { message: info, variant: "info" } : null;
}

/**
 * Determine the reason a date is disabled.
 * Checks conditions in priority order matching upstream logic.
 */
function getDisabledReason(d, dateKey, ctx) {
    // Past date
    if (d.isBefore(ctx.today, "day")) {
        return $__("Cannot select: date is in the past");
    }

    // Holiday
    if (ctx.holidays && ctx.holidays.includes(dateKey)) {
        return $__("Cannot select: library is closed on this date");
    }

    // Insufficient lead time from today
    if (ctx.isSelectingStart && ctx.leadDays > 0) {
        const minStart = ctx.today.add(ctx.leadDays, "day");
        if (d.isBefore(minStart, "day")) {
            return $__(
                "Cannot select: insufficient lead time (%s days required before start)"
            ).format(ctx.leadDays);
        }
    }

    // Exceeds maximum booking period
    if (
        ctx.isSelectingEnd &&
        ctx.maxPeriod > 0 &&
        ctx.selectedDateRange?.[0]
    ) {
        const start = BookingDate.from(ctx.selectedDateRange[0]).toDayjs();
        if (d.isAfter(start.add(ctx.maxPeriod, "day"), "day")) {
            return $__(
                "Cannot select: exceeds maximum booking period (%s days)"
            ).format(ctx.maxPeriod);
        }
    }

    // Check markers in unavailableByDate for specific reasons
    const markerReasons = collectMarkerReasons(ctx.unavailableByDate, dateKey);

    if (markerReasons.has("holiday")) {
        return $__("Cannot select: library is closed on this date");
    }
    if (
        markerReasons.has("booking") ||
        markerReasons.has("booked") ||
        markerReasons.has("core")
    ) {
        return $__(
            "Cannot select: this date is part of an existing booking"
        );
    }
    if (
        markerReasons.has("checkout") ||
        markerReasons.has("checked-out")
    ) {
        return $__(
            "Cannot select: this date is part of an existing checkout"
        );
    }
    if (markerReasons.has("lead-floor")) {
        return $__(
            "Cannot select: minimum %s-day lead time from today is required before any booking can start"
        ).format(ctx.leadDays);
    }
    if (markerReasons.has("lead-theoretical")) {
        return $__(
            "Cannot select: a %s-day lead time is required after an existing booking's trail period before a new booking can start"
        ).format(ctx.leadDays);
    }
    if (markerReasons.has("lead")) {
        return $__(
            "Cannot select: this date is part of an existing booking's lead period"
        );
    }
    if (markerReasons.has("trail")) {
        return $__(
            "Cannot select: this date is part of an existing booking's trail period"
        );
    }

    // Lead period of selected start would conflict
    if (ctx.isSelectingStart && ctx.leadDays > 0) {
        return $__(
            "Cannot select: lead period (%s days before start) conflicts with an existing booking"
        ).format(ctx.leadDays);
    }

    // Trail period of selected end would conflict
    if (ctx.isSelectingEnd && ctx.trailDays > 0) {
        return $__(
            "Cannot select: trail period (%s days after return) conflicts with an existing booking"
        ).format(ctx.trailDays);
    }

    return $__("Cannot select: conflicts with an existing booking");
}

/**
 * Generate info message for an enabled (selectable) date.
 */
function getEnabledInfo(ctx) {
    // Collect context appendages from markers
    const appendages = [];
    const markerReasons = collectMarkerReasons(
        ctx.unavailableByDate,
        ctx.dateKey
    );
    if (markerReasons.has("lead-floor")) {
        appendages.push(
            $__("within minimum lead time from today")
        );
    }
    if (markerReasons.has("lead-theoretical")) {
        appendages.push(
            $__("within lead time required after an existing booking's trail")
        );
    }
    if (markerReasons.has("lead")) {
        appendages.push(
            $__("hovering an existing booking's lead period")
        );
    }
    if (markerReasons.has("trail")) {
        appendages.push(
            $__("hovering an existing booking's trail period")
        );
    }

    const suffix =
        appendages.length > 0 ? " \u2022 " + appendages.join(", ") : "";

    if (ctx.isSelectingStart) {
        const extras = [];
        if (ctx.leadDays > 0) {
            extras.push(
                $__("Lead period: %s days before start").format(ctx.leadDays)
            );
        }
        if (ctx.trailDays > 0) {
            extras.push(
                $__("Trail period: %s days after return").format(
                    ctx.trailDays
                )
            );
        }
        const detail = extras.length > 0 ? ". " + extras.join(". ") : "";
        return $__("Select a start date") + detail + suffix;
    }

    if (ctx.isSelectingEnd) {
        const detail =
            ctx.trailDays > 0
                ? ". " +
                  $__("Trail period: %s days after return").format(
                      ctx.trailDays
                  )
                : "";
        return $__("Select an end date") + detail + suffix;
    }

    return null;
}

/**
 * Collect all marker reason strings for a date from the unavailableByDate map.
 * @param {Object} unavailableByDate
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {Set<string>}
 */
function collectMarkerReasons(unavailableByDate, dateKey) {
    const reasons = new Set();
    const entry = unavailableByDate?.[dateKey];
    if (!entry) return reasons;

    Object.values(entry).forEach(itemReasons => {
        if (itemReasons instanceof Set) {
            itemReasons.forEach(r => reasons.add(r));
        } else if (Array.isArray(itemReasons)) {
            itemReasons.forEach(r => reasons.add(r));
        }
    });
    return reasons;
}
