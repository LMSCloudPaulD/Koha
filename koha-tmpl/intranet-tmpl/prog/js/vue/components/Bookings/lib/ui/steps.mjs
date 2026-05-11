/**
 * Pure functions for booking step calculation and management
 * Extracted from BookingStepService to provide pure, testable functions
 */

/**
 * Calculate step numbers based on configuration
 * @param {boolean} showPatronSelect - Whether patron selection step is shown
 * @param {boolean} showItemDetailsSelects - Whether item details step is shown
 * @param {boolean} showPickupLocationSelect - Whether pickup location step is shown
 * @returns {{patron:number,details:number,period:number}} Step numbers for each section
 */
export function calculateStepNumbers(
    showPatronSelect,
    showItemDetailsSelects,
    showPickupLocationSelect
) {
    let currentStep = 1;
    const steps = {
        patron: 0,
        details: 0,
        period: 0,
    };

    if (showPatronSelect) {
        steps.patron = currentStep++;
    }

    if (showItemDetailsSelects || showPickupLocationSelect) {
        steps.details = currentStep++;
    }

    steps.period = currentStep++;

    return steps;
}
