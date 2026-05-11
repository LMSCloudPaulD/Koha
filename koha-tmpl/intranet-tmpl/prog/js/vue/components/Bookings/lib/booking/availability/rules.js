/**
 * Circulation rules utilities for booking availability.
 * @module availability/rules
 */

import { BookingDate } from "../BookingDate.js";
import { CONSTRAINT_MODE_END_DATE_ONLY } from "../constants.js";

/**
 * Extracts and validates configuration from circulation rules
 * @param {Object} circulationRules - Raw circulation rules object
 * @param {Date|import('dayjs').Dayjs} todayArg - Optional today value for deterministic tests
 * @returns {Object} Normalized configuration object
 */
export function extractBookingConfiguration(circulationRules, todayArg) {
    const today = todayArg
        ? BookingDate.from(todayArg).toDayjs()
        : BookingDate.today().toDayjs();
    const leadDays = Number(circulationRules?.bookings_lead_period) || 0;
    const trailDays = Number(circulationRules?.bookings_trail_period) || 0;
    // In unconstrained mode, do not enforce a default max period
    const maxPeriod =
        Number(circulationRules?.maxPeriod) ||
        Number(circulationRules?.issuelength) ||
        0;
    const isEndDateOnly =
        circulationRules?.booking_constraint_mode ===
        CONSTRAINT_MODE_END_DATE_ONLY;
    const calculatedDueDate = circulationRules?.calculated_due_date
        ? BookingDate.from(circulationRules.calculated_due_date).toDayjs()
        : null;
    const calculatedPeriodDays = Number(
        circulationRules?.calculated_period_days
    )
        ? Number(circulationRules.calculated_period_days)
        : null;

    return {
        today,
        leadDays,
        trailDays,
        maxPeriod,
        isEndDateOnly,
        calculatedDueDate,
        calculatedPeriodDays,
    };
}

/**
 * Derive effective circulation rules with constraint options applied.
 * - Applies maxPeriod only for constraining modes
 * - Strips caps for unconstrained mode
 * @param {import('../../../types/bookings').CirculationRule} [baseRules={}]
 * @param {import('../../../types/bookings').ConstraintOptions} [constraintOptions={}]
 * @returns {import('../../../types/bookings').CirculationRule}
 */
export function deriveEffectiveRules(baseRules = {}, constraintOptions = {}) {
    const effectiveRules = { ...baseRules };
    const mode = constraintOptions.dateRangeConstraint;
    if (mode === "issuelength" || mode === "issuelength_with_renewals") {
        if (constraintOptions.maxBookingPeriod) {
            effectiveRules.maxPeriod = constraintOptions.maxBookingPeriod;
        }
    } else {
        if ("maxPeriod" in effectiveRules) delete effectiveRules.maxPeriod;
        if ("issuelength" in effectiveRules) delete effectiveRules.issuelength;
    }
    return effectiveRules;
}

/**
 * Convenience: take full circulationRules array and constraint options,
 * return effective rules applying maxPeriod logic.
 * @param {import('../../../types/bookings').CirculationRule[]} circulationRules
 * @param {import('../../../types/bookings').ConstraintOptions} [constraintOptions={}]
 * @returns {import('../../../types/bookings').CirculationRule}
 */
export function toEffectiveRules(circulationRules, constraintOptions = {}) {
    const baseRules = circulationRules?.[0] || {};
    return deriveEffectiveRules(baseRules, constraintOptions);
}

/**
 * Calculate maximum booking period from circulation rules and constraint mode.
 */
export function calculateMaxBookingPeriod(
    circulationRules,
    dateRangeConstraint,
    customDateRangeFormula = null
) {
    if (!dateRangeConstraint) return null;
    const rules = circulationRules?.[0];
    if (!rules) return null;
    const issuelength = parseInt(rules.issuelength) || 0;
    switch (dateRangeConstraint) {
        case "issuelength":
            return issuelength;
        case "issuelength_with_renewals":
            const renewalperiod = parseInt(rules.renewalperiod) || 0;
            const renewalsallowed = parseInt(rules.renewalsallowed) || 0;
            return issuelength + renewalperiod * renewalsallowed;
        case "custom":
            return typeof customDateRangeFormula === "function"
                ? customDateRangeFormula(rules)
                : null;
        default:
            return null;
    }
}
