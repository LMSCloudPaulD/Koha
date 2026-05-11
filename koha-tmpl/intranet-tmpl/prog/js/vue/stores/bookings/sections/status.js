import { ref, reactive } from "vue";

/**
 * Status section: async-operation tracking and UI-level error state.
 *
 * Owns `loading` and `error` maps keyed by the same operation name
 * (so each fetch/mutate action can flip both via `withErrorHandling`).
 * Owns `uiError` for validation messages surfaced in the modal that
 * are not tied to a specific async operation.
 */
export function useStatusSection() {
    const dataFetched = ref(false);

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

    const error = reactive({
        bookableItems: null,
        bookings: null,
        checkouts: null,
        patrons: null,
        bookingPatron: null,
        pickupLocations: null,
        circulationRules: null,
        holidays: null,
        submit: null,
    });

    const uiError = reactive({ message: "", code: null });

    function resetErrors() {
        Object.keys(error).forEach(key => {
            error[key] = null;
        });
    }

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

    function clearAllErrors() {
        resetErrors();
        clearUiError();
    }

    return {
        dataFetched,
        loading,
        error,
        uiError,

        resetErrors,
        setUiError,
        clearUiError,
        clearAllErrors,
    };
}
