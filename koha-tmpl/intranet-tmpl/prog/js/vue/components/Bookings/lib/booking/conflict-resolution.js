/**
 * Conflict resolution utilities for booking availability.
 *
 * Centralizes conflict detection and resolution logic for booking availability.
 *
 * @module conflict-resolution
 */

/**
 * @typedef {Object} ConflictContext
 * @property {string|null} selectedItem - Selected item ID or null for "any item" mode
 * @property {number|null} editBookingId - Booking ID being edited (excluded from conflicts)
 * @property {string[]} allItemIds - All available item IDs for "any item" mode resolution
 */

/**
 * @typedef {Object} ConflictResult
 * @property {boolean} hasConflict - Whether there is a blocking conflict
 * @property {Array} conflicts - The relevant conflicts (filtered by editBookingId)
 * @property {Set<string>} [itemsWithConflicts] - Set of item IDs that have conflicts (any item mode only)
 */

/**
 * Filter conflicts by edit booking ID and resolve based on item selection mode.
 *
 * This function encapsulates the conflict resolution logic that determines whether
 * a date/range should be blocked based on existing bookings and checkouts.
 *
 * Resolution modes:
 * - **Single item mode** (selectedItem !== null): Any conflict blocks the date
 * - **Any item mode** (selectedItem === null): Only block if ALL items have conflicts
 *
 * @param {Array} conflicts - Raw conflicts from interval tree query
 * @param {ConflictContext} ctx - Context for conflict resolution
 * @returns {ConflictResult} Resolution result with conflict status and details
 *
 * @example
 * // Single item mode
 * const result = resolveConflicts(conflicts, {
 *     selectedItem: '123',
 *     editBookingId: null,
 *     allItemIds: ['123', '456']
 * });
 * if (result.hasConflict) { // Block the date }
 *
 * @example
 * // Any item mode - only blocks if all items unavailable
 * const result = resolveConflicts(conflicts, {
 *     selectedItem: null,
 *     editBookingId: 789,  // Editing booking 789, exclude from conflicts
 *     allItemIds: ['123', '456', '789']
 * });
 */
export function resolveConflicts(conflicts, ctx) {
    const { selectedItem, editBookingId, allItemIds } = ctx;

    // Filter out the booking being edited
    const relevant = editBookingId
        ? conflicts.filter(c => c.metadata?.booking_id != editBookingId)
        : conflicts;

    if (relevant.length === 0) {
        return { hasConflict: false, conflicts: [] };
    }

    // Single item mode: any conflict blocks
    if (selectedItem) {
        return { hasConflict: true, conflicts: relevant };
    }

    // Any item mode: only block if ALL items have conflicts
    const itemsWithConflicts = new Set(relevant.map(c => String(c.itemId)));
    const allBlocked =
        allItemIds.length > 0 &&
        allItemIds.every(id => itemsWithConflicts.has(String(id)));

    return {
        hasConflict: allBlocked,
        conflicts: relevant,
        itemsWithConflicts,
    };
}

/**
 * Query interval tree for a point in time and resolve conflicts.
 *
 * Convenience wrapper that combines a point query with conflict resolution.
 *
 * @param {Object} intervalTree - Interval tree instance
 * @param {number} timestamp - Timestamp to query (milliseconds)
 * @param {ConflictContext} ctx - Context for conflict resolution
 * @returns {ConflictResult} Resolution result
 */
export function queryPointAndResolve(intervalTree, timestamp, ctx) {
    const conflicts = intervalTree.query(timestamp, ctx.selectedItem);
    return resolveConflicts(conflicts, ctx);
}

/**
 * Query interval tree for a range and resolve conflicts.
 *
 * Convenience wrapper that combines a range query with conflict resolution.
 *
 * @param {Object} intervalTree - Interval tree instance
 * @param {number} startTs - Start timestamp (milliseconds)
 * @param {number} endTs - End timestamp (milliseconds)
 * @param {ConflictContext} ctx - Context for conflict resolution
 * @returns {ConflictResult} Resolution result
 */
export function queryRangeAndResolve(intervalTree, startTs, endTs, ctx) {
    const conflicts = intervalTree.queryRange(startTs, endTs, ctx.selectedItem);
    return resolveConflicts(conflicts, ctx);
}

/**
 * Create a conflict context object from common parameters.
 *
 * Helper to construct a ConflictContext from the parameters commonly
 * passed around in availability checking functions.
 *
 * @param {string|number|null} selectedItem - Selected item ID or null
 * @param {string|number|null} editBookingId - Booking ID being edited
 * @param {string[]} allItemIds - All available item IDs
 * @returns {ConflictContext}
 */
export function createConflictContext(selectedItem, editBookingId, allItemIds) {
    return {
        selectedItem: selectedItem != null ? String(selectedItem) : null,
        editBookingId: editBookingId != null ? Number(editBookingId) : null,
        allItemIds: allItemIds.map(id => String(id)),
    };
}
