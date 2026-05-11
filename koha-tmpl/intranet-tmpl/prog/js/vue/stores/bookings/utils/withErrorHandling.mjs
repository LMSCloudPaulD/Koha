import { processApiError } from "../../../utils/apiErrors.js";

/**
 * Build a withErrorHandling HOF bound to a section's reactive
 * loading/error objects. Wraps an async operation with the
 * standard set-loading / clear-error / catch-and-record /
 * always-clear-loading pattern, eliminating the per-action
 * try/catch/finally boilerplate.
 *
 * @param {Record<string, boolean>} loading - Reactive loading-flag map
 * @param {Record<string, *>} error - Reactive error-state map
 */
export function makeWithErrorHandling(loading, error) {
    /**
     * Wrap an async operation. The returned function preserves the
     * exact signature of `operation` via the F generic so consumers
     * (and Pinia's setup-store type inference) see specific argument
     * and return types instead of the bare `Function` type.
     *
     * @template {(...args: any[]) => Promise<any>} F
     * @param {F} operation
     * @param {string} loadingKey
     * @param {string} [errorKey]
     * @returns {F}
     */
    function withErrorHandling(operation, loadingKey, errorKey) {
        const wrapped = async function (...args) {
            const errorField = errorKey || loadingKey;
            loading[loadingKey] = true;
            error[errorField] = null;
            try {
                return await operation(...args);
            } catch (e) {
                error[errorField] = processApiError(e);
                throw e;
            } finally {
                loading[loadingKey] = false;
            }
        };
        return /** @type {F} */ (wrapped);
    }
    return withErrorHandling;
}
