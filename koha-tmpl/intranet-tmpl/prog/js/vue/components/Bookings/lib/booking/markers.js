/**
 * Marker generation and aggregation for the booking system.
 *
 * This module handles generation of calendar markers from availability data
 * and aggregation of markers by type for display purposes.
 *
 * @module markers
 */

import { BookingDate } from "./BookingDate.js";
import { idsEqual } from "./id-utils.js";
import {
    CLASS_BOOKING_MARKER_COUNT,
    CLASS_BOOKING_MARKER_DOT,
    CLASS_BOOKING_MARKER_GRID,
    CLASS_BOOKING_MARKER_ITEM,
    MARKER_TYPE_MAP,
} from "./constants.js";

/**
 * Aggregate all booking/checkouts for a given date (for calendar indicators)
 * @param {import('../../types/bookings').UnavailableByDate} unavailableByDate - Map produced by buildUnavailableByDateMap
 * @param {string|Date|import("dayjs").Dayjs} dateStr - date to check (YYYY-MM-DD or Date or dayjs)
 * @param {Array<import('../../types/bookings').BookableItem>} bookableItems - Array of all bookable items
 * @returns {import('../../types/bookings').CalendarMarker[]} indicators for that date
 */
export function getBookingMarkersForDate(
    unavailableByDate,
    dateStr,
    bookableItems = []
) {
    if (!unavailableByDate) {
        return [];
    }

    let d;
    try {
        d = dateStr
            ? BookingDate.from(dateStr).toDayjs()
            : BookingDate.today().toDayjs();
    } catch {
        d = BookingDate.today().toDayjs();
    }
    const key = d.format("YYYY-MM-DD");
    const markers = [];

    const findItem = item_id => {
        if (item_id == null) return undefined;
        return bookableItems.find(i => idsEqual(i?.item_id, item_id));
    };

    const entry = unavailableByDate[key];

    if (!entry) {
        return [];
    }

    for (const [item_id, reasons] of Object.entries(entry)) {
        const item = findItem(item_id);
        for (const reason of reasons) {
            // Map IntervalTree/Sweep reasons to CSS class names
            // lead and trail periods keep their original names for CSS
            const type = MARKER_TYPE_MAP[reason] ?? reason;
            markers.push({
                /** @type {import('../../types/bookings').MarkerType} */
                type: /** @type {any} */ (type),
                item: String(item_id),
                itemName: item?.title || String(item_id),
                barcode: item?.barcode || item?.external_id || null,
            });
        }
    }
    return markers;
}

/**
 * Aggregate markers by type for display
 * @param {Array} markers - Array of booking markers
 * @returns {import('../../types/bookings').MarkerAggregation} Aggregated counts by type
 */
export function aggregateMarkersByType(markers) {
    return markers.reduce((acc, marker) => {
        // Lead/trail markers (including the lead-floor / lead-theoretical
        // variants emitted by the unavailable-map builders) are reflected
        // through CSS class names and hover feedback, not the dot grid.
        if (
            marker.type !== "lead" &&
            marker.type !== "lead-floor" &&
            marker.type !== "lead-theoretical" &&
            marker.type !== "trail"
        ) {
            acc[marker.type] = (acc[marker.type] || 0) + 1;
        }
        return acc;
    }, {});
}

/**
 * Build the DOM grid for aggregated booking markers.
 *
 * @param {import('../../types/bookings').MarkerAggregation} aggregatedMarkers - counts by marker type
 * @returns {HTMLDivElement} container element with marker items
 */
export function buildMarkerGrid(aggregatedMarkers) {
    const gridContainer = document.createElement("div");
    gridContainer.className = CLASS_BOOKING_MARKER_GRID;
    Object.entries(aggregatedMarkers).forEach(([type, count]) => {
        const markerSpan = document.createElement("span");
        markerSpan.className = CLASS_BOOKING_MARKER_ITEM;

        const dot = document.createElement("span");
        dot.className = `${CLASS_BOOKING_MARKER_DOT} ${CLASS_BOOKING_MARKER_DOT}--${type}`;
        dot.title = type.charAt(0).toUpperCase() + type.slice(1);
        markerSpan.appendChild(dot);

        if (count > 0) {
            const countSpan = document.createElement("span");
            countSpan.className = CLASS_BOOKING_MARKER_COUNT;
            countSpan.textContent = ` ${count}`;
            markerSpan.appendChild(countSpan);
        }
        gridContainer.appendChild(markerSpan);
    });
    return gridContainer;
}
