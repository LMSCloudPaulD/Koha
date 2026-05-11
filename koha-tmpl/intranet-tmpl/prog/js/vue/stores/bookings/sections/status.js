import { reactive } from "vue";

/**
 * Status section: async-operation tracking and UI-level error state.
 *
 * Owns the `loading` map keyed by operation name (flipped per action via
 * `withErrorHandling`). Owns `uiError` for messages surfaced in the modal;
 * fetch/mutate failures propagate to callers, which set `uiError` via
 * `processApiError`.
 */
export function useStatusSection() {
    const loading = reactive({
        bookableItems: false,
        bookings: false,
        checkouts: false,
        patrons: false,
        bookingPatron: false,
        pickupLocations: false,
        circulationRules: false,
        holidays: false,
        submit: false,
    });

    const uiError = reactive({ message: "", code: null });

    /**
     * @param {string} message - Error message to display
     * @param {string} code - Categorization code (e.g. "api",
     *   "validation", "no_items"). When `message` is empty the code
     *   is forced to null so consumers can use a single check.
     */
    function setUiError(message, code = "general") {
        uiError.message = message || "";
        uiError.code = message ? code : null;
    }

    function clearUiError() {
        uiError.message = "";
        uiError.code = null;
    }

    // Retained for callers that historically cleared per-operation and UI
    // error state together; only `uiError` remains, so this clears it.
    function clearAllErrors() {
        clearUiError();
    }

    return {
        loading,
        uiError,

        setUiError,
        clearUiError,
        clearAllErrors,
    };
}
