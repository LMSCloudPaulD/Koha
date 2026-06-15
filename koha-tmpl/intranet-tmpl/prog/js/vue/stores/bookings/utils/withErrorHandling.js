/**
 * Build a withErrorHandling HOF bound to a section's reactive `loading`
 * map. Wraps an async operation with set-loading / always-clear-loading,
 * eliminating the per-action try/finally boilerplate. Errors propagate to
 * the caller, which surfaces them via `setUiError`/`processApiError`.
 *
 * @param {Record<string, boolean>} loading - Reactive loading-flag map
 */
export function makeWithErrorHandling(loading) {
    /**
     * @template {(...args: any[]) => Promise<any>} F
     * @param {F} operation
     * @param {string} loadingKey
     * @returns {F}
     */
    function withErrorHandling(operation, loadingKey) {
        const wrapped = async function (...args) {
            loading[loadingKey] = true;
            try {
                return await operation(...args);
            } finally {
                loading[loadingKey] = false;
            }
        };
        return /** @type {F} */ (wrapped);
    }
    return withErrorHandling;
}
