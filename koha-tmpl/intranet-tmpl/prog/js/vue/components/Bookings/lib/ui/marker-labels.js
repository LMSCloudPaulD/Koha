/**
 * Marker label utilities for booking calendar display
 * @module marker-labels
 */

import { $__ } from "../../../../i18n/index.js";

/**
 * Get the translated display label for a marker type
 * @param {string} type - The marker type identifier (e.g., "booked", "checked-out", "lead", "lead-floor", "lead-theoretical", "trail", "holiday")
 * @returns {string} The translated label or the original type if no translation exists
 */
export function getMarkerTypeLabel(type) {
    const labels = {
        booked: $__("Booked"),
        "checked-out": $__("Checked out"),
        lead: $__("Lead period"),
        "lead-floor": $__("Minimum lead time from today"),
        "lead-theoretical": $__("Lead period for a follow-up booking"),
        trail: $__("Trail period"),
        holiday: $__("Library closed"),
    };
    return labels[type] || type;
}
