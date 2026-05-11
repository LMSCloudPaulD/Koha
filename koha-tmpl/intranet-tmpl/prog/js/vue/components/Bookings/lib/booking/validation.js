/**
 * Pure functions for booking validation logic
 */

/**
 * Validate if user can proceed to step 3 (period selection)
 * @param {Object} validationData - All required data for validation
 * @param {boolean} validationData.showPatronSelect - Whether patron selection is required
 * @param {Object} validationData.bookingPatron - Selected booking patron
 * @param {boolean} validationData.showPickupLocationSelect - Whether pickup location is required
 * @param {string} validationData.pickupLibraryId - Selected pickup library ID
 * @param {Array} validationData.bookableItems - Available bookable items
 * @returns {boolean} Whether the user can proceed to step 3
 */
export function canProceedToStep3(validationData) {
    const {
        showPatronSelect,
        bookingPatron,
        showPickupLocationSelect,
        pickupLibraryId,
        bookableItems,
    } = validationData;

    if (showPatronSelect && !bookingPatron) {
        return false;
    }

    if (showPickupLocationSelect && !pickupLibraryId) {
        return false;
    }

    if (!bookableItems || bookableItems.length === 0) {
        return false;
    }

    return true;
}

/**
 * Validate if form can be submitted
 * @param {Object} validationData - Data required for step 3 validation
 * @param {Array} dateRange - Selected date range
 * @returns {boolean} Whether the form can be submitted
 */
export function canSubmitBooking(validationData, dateRange) {
    if (!canProceedToStep3(validationData)) return false;
    if (!Array.isArray(dateRange) || dateRange.length < 2) return false;

    return true;
}
