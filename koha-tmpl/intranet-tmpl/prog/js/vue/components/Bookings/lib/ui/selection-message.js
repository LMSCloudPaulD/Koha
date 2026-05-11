/**
 * User-facing message builders for booking selection feedback
 * @module selection-message
 */

import { idsEqual } from "../booking/id-utils.js";
import { $__ } from "../../../../i18n/index.js";

/**
 * Build a localized message explaining why no items are available for booking
 * @param {Array<{library_id: string, name: string}>} pickupLocations - Available pickup locations
 * @param {Array<{item_type_id: string, description: string}>} itemTypes - Available item types
 * @param {string|null} pickupLibraryId - Currently selected pickup location ID
 * @param {string|null} itemtypeId - Currently selected item type ID
 * @returns {string} Translated message describing the selection criteria
 */
export function buildNoItemsAvailableMessage(
    pickupLocations,
    itemTypes,
    pickupLibraryId,
    itemtypeId
) {
    const selectionParts = [];
    if (pickupLibraryId) {
        const location = (pickupLocations || []).find(l =>
            idsEqual(l.library_id, pickupLibraryId)
        );
        selectionParts.push(
            $__("pickup location: %s").format(
                (location && location.name) || pickupLibraryId
            )
        );
    }
    if (itemtypeId) {
        const itemType = (itemTypes || []).find(t =>
            idsEqual(t.item_type_id, itemtypeId)
        );
        selectionParts.push(
            $__("item type: %s").format(
                (itemType && itemType.description) || itemtypeId
            )
        );
    }
    return $__(
        "No items are available for booking with the selected criteria (%s). Please adjust your selection."
    ).format(selectionParts.join(", "));
}
