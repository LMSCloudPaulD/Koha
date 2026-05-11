/**
 * Augmented AVL interval tree for booking date queries.
 *
 * Provides O(log n + k) query performance for finding overlapping
 * bookings/checkouts. Each node is augmented with a `max` field
 * (highest end timestamp in the subtree) to prune search branches.
 */

import { BookingDate } from "../BookingDate.js";
import { managerLogger as logger } from "../logger.js";

/**
 * Represents a booking or checkout interval.
 *
 * @class BookingInterval
 */
export class BookingInterval {
    /**
     * @param {string|Date|import("dayjs").Dayjs} startDate
     * @param {string|Date|import("dayjs").Dayjs} endDate
     * @param {string|number} itemId
     * @param {'booking'|'checkout'|'lead'|'trail'|'query'} type
     * @param {Object} [metadata={}]
     */
    constructor(startDate, endDate, itemId, type, metadata = {}) {
        /** @type {number} */
        this.start = BookingDate.from(startDate).valueOf();
        /** @type {number} */
        this.end = BookingDate.from(endDate).valueOf();
        /** @type {string} */
        this.itemId = String(itemId);
        /** @type {'booking'|'checkout'|'lead'|'trail'|'query'} */
        this.type = type;
        /** @type {Object} */
        this.metadata = metadata;

        if (this.start > this.end) {
            throw new Error(
                `Invalid interval: start (${startDate}) is after end (${endDate})`
            );
        }
    }

    /**
     * @param {number|Date|import("dayjs").Dayjs} date
     * @returns {boolean}
     */
    containsDate(date) {
        const timestamp =
            typeof date === "number" ? date : BookingDate.from(date).valueOf();
        return timestamp >= this.start && timestamp <= this.end;
    }

    /**
     * @param {BookingInterval} other
     * @returns {boolean}
     */
    overlaps(other) {
        return this.start <= other.end && other.start <= this.end;
    }

    /**
     * @returns {string}
     */
    toString() {
        const startStr = BookingDate.from(this.start).format("YYYY-MM-DD");
        const endStr = BookingDate.from(this.end).format("YYYY-MM-DD");
        return `${this.type}[${startStr} to ${endStr}] item:${this.itemId}`;
    }
}

/**
 * Node in the interval tree.
 *
 * @class IntervalTreeNode
 * @private
 */
class IntervalTreeNode {
    /**
     * @param {BookingInterval} interval
     */
    constructor(interval) {
        /** @type {BookingInterval} */
        this.interval = interval;
        /** @type {number} Maximum end value in this subtree */
        this.max = interval.end;
        /** @type {IntervalTreeNode|null} */
        this.left = null;
        /** @type {IntervalTreeNode|null} */
        this.right = null;
        /** @type {number} */
        this.height = 1;
    }

    updateMax() {
        this.max = this.interval.end;
        if (this.left && this.left.max > this.max) {
            this.max = this.left.max;
        }
        if (this.right && this.right.max > this.max) {
            this.max = this.right.max;
        }
    }
}

/**
 * Interval tree implementation with AVL balancing
 * Provides efficient O(log n) queries for interval overlaps
 * @class IntervalTree
 */
export class IntervalTree {
    /**
     * Create a new interval tree
     */
    constructor() {
        /** @type {IntervalTreeNode|null} Root node of the tree */
        this.root = null;
        /** @type {number} Number of intervals in the tree */
        this.size = 0;
        /** @type {boolean} Whether the last _removeNode pass deleted a node */
        this._removeFound = false;
    }

    /**
     * @param {IntervalTreeNode|null} node
     * @returns {number}
     * @private
     */
    _getHeight(node) {
        return node ? node.height : 0;
    }

    /**
     * @param {IntervalTreeNode|null} node
     * @returns {number} Left height minus right height
     * @private
     */
    _getBalance(node) {
        return node
            ? this._getHeight(node.left) - this._getHeight(node.right)
            : 0;
    }

    /**
     * @param {IntervalTreeNode} node
     * @private
     */
    _updateHeight(node) {
        if (node) {
            node.height =
                1 +
                Math.max(
                    this._getHeight(node.left),
                    this._getHeight(node.right)
                );
        }
    }

    /**
     * @param {IntervalTreeNode} y
     * @returns {IntervalTreeNode}
     * @private
     */
    _rotateRight(y) {
        if (!y || !y.left) {
            logger.error("Invalid rotation: y or y.left is null", {
                y: y?.interval?.toString(),
            });
            return y;
        }

        const x = y.left;
        const T2 = x.right;

        x.right = y;
        y.left = T2;

        this._updateHeight(y);
        this._updateHeight(x);
        y.updateMax();
        x.updateMax();

        return x;
    }

    /**
     * @param {IntervalTreeNode} x
     * @returns {IntervalTreeNode}
     * @private
     */
    _rotateLeft(x) {
        if (!x || !x.right) {
            logger.error("Invalid rotation: x or x.right is null", {
                x: x?.interval?.toString(),
            });
            return x;
        }

        const y = x.right;
        const T2 = y.left;

        y.left = x;
        x.right = T2;

        this._updateHeight(x);
        this._updateHeight(y);
        x.updateMax();
        y.updateMax();

        return y;
    }

    /**
     * Insert an interval into the tree
     * @param {BookingInterval} interval - The interval to insert
     * @throws {Error} If the interval is invalid
     */
    insert(interval) {
        this.root = this._insertNode(this.root, interval);
        this.size++;
    }

    /**
     * @param {IntervalTreeNode} node
     * @param {BookingInterval} interval
     * @returns {IntervalTreeNode}
     * @private
     */
    _insertNode(node, interval) {
        if (!node) {
            return new IntervalTreeNode(interval);
        }

        if (interval.start < node.interval.start) {
            node.left = this._insertNode(node.left, interval);
        } else {
            node.right = this._insertNode(node.right, interval);
        }

        this._updateHeight(node);
        node.updateMax();

        const balance = this._getBalance(node);

        if (balance > 1) {
            if (interval.start < node.left.interval.start) {
                return this._rotateRight(node);
            } else {
                node.left = this._rotateLeft(node.left);
                return this._rotateRight(node);
            }
        }

        if (balance < -1) {
            // >= because equal starts are routed into the right subtree
            // on insert: an equal-start interval below node.right sits in
            // node.right's RIGHT subtree, so this is an RR case. Strict >
            // would misclassify it as RL and rotate a null left child.
            if (interval.start >= node.right.interval.start) {
                return this._rotateLeft(node);
            } else {
                node.right = this._rotateRight(node.right);
                return this._rotateLeft(node);
            }
        }

        return node;
    }

    /**
     * Query all intervals that contain a specific date
     * @param {Date|import("dayjs").Dayjs|number} date - The date to query (Date object, dayjs instance, or timestamp)
     * @param {string|null} [itemId=null] - Optional: filter by item ID (null for all items)
     * @returns {BookingInterval[]} Array of intervals that contain the date
     */
    query(date, itemId = null) {
        const timestamp =
            typeof date === "number" ? date : BookingDate.from(date).valueOf();
        const results = [];
        this._queryNode(this.root, timestamp, results, itemId);
        return results;
    }

    /**
     * @param {IntervalTreeNode} node
     * @param {number} timestamp
     * @param {BookingInterval[]} results
     * @param {string} itemId
     * @private
     */
    _queryNode(node, timestamp, results, itemId) {
        if (!node) return;

        if (node.interval.containsDate(timestamp)) {
            if (!itemId || node.interval.itemId === itemId) {
                results.push(node.interval);
            }
        }

        if (node.left && node.left.max >= timestamp) {
            this._queryNode(node.left, timestamp, results, itemId);
        }

        if (node.right && node.interval.start <= timestamp) {
            this._queryNode(node.right, timestamp, results, itemId);
        }
    }

    /**
     * Query all intervals that overlap with a date range
     * @param {Date|import("dayjs").Dayjs|number} startDate - Start of the range to query
     * @param {Date|import("dayjs").Dayjs|number} endDate - End of the range to query
     * @param {string|null} [itemId=null] - Optional: filter by item ID (null for all items)
     * @returns {BookingInterval[]} Array of intervals that overlap with the range
     */
    queryRange(startDate, endDate, itemId = null) {
        const startTimestamp =
            typeof startDate === "number"
                ? startDate
                : BookingDate.from(startDate).valueOf();
        const endTimestamp =
            typeof endDate === "number"
                ? endDate
                : BookingDate.from(endDate).valueOf();

        const queryInterval = new BookingInterval(
            new Date(startTimestamp),
            new Date(endTimestamp),
            "",
            "query"
        );
        const results = [];
        this._queryRangeNode(this.root, queryInterval, results, itemId);
        return results;
    }

    /**
     * @param {IntervalTreeNode} node
     * @param {BookingInterval} queryInterval
     * @param {BookingInterval[]} results
     * @param {string} itemId
     * @private
     */
    _queryRangeNode(node, queryInterval, results, itemId) {
        if (!node) return;

        if (node.interval.overlaps(queryInterval)) {
            if (!itemId || node.interval.itemId === itemId) {
                results.push(node.interval);
            }
        }

        if (node.left && node.left.max >= queryInterval.start) {
            this._queryRangeNode(node.left, queryInterval, results, itemId);
        }

        if (node.right && node.interval.start <= queryInterval.end) {
            this._queryRangeNode(node.right, queryInterval, results, itemId);
        }
    }

    /**
     * Remove all intervals matching a predicate
     * @param {Function} predicate - Function that returns true for intervals to remove
     * @returns {number} Number of intervals removed
     */
    removeWhere(predicate) {
        const toRemove = [];
        this._collectNodes(this.root, node => {
            if (predicate(node.interval)) {
                toRemove.push(node.interval);
            }
        });

        toRemove.forEach(interval => {
            this._removeFound = false;
            this.root = this._removeNode(this.root, interval);
            if (this._removeFound) {
                this.size--;
            }
        });

        return toRemove.length;
    }

    /**
     * @param {IntervalTreeNode} node
     * @param {Function} callback
     * @private
     */
    _collectNodes(node, callback) {
        if (!node) return;
        this._collectNodes(node.left, callback);
        callback(node);
        this._collectNodes(node.right, callback);
    }

    /**
     * Remove a specific interval. Does not rebalance.
     *
     * @param {IntervalTreeNode} node
     * @param {BookingInterval} interval
     * @returns {IntervalTreeNode}
     * @private
     */
    _removeNode(node, interval) {
        if (!node) return null;

        if (interval.start < node.interval.start) {
            node.left = this._removeNode(node.left, interval);
        } else if (interval.start > node.interval.start) {
            node.right = this._removeNode(node.right, interval);
        } else if (
            interval.end === node.interval.end &&
            interval.itemId === node.interval.itemId &&
            interval.type === node.interval.type
        ) {
            this._removeFound = true;
            if (!node.left) return node.right;
            if (!node.right) return node.left;

            let minNode = node.right;
            while (minNode.left) {
                minNode = minNode.left;
            }

            node.interval = minNode.interval;
            node.right = this._removeNode(node.right, minNode.interval);
        } else {
            // Equal start but different identity: rotations can place
            // equal-start peers in either subtree, so search both sides
            // (right first — inserts route equal keys right).
            node.right = this._removeNode(node.right, interval);
            if (!this._removeFound) {
                node.left = this._removeNode(node.left, interval);
            }
        }

        if (node) {
            this._updateHeight(node);
            node.updateMax();
        }

        return node;
    }

    /**
     * Clear all intervals
     */
    clear() {
        this.root = null;
        this.size = 0;
    }

    /**
     * Get statistics about the tree for debugging and monitoring
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            size: this.size,
            height: this._getHeight(this.root),
            balanced: Math.abs(this._getBalance(this.root)) <= 1,
        };
    }
}

/**
 * Build an interval tree from bookings and checkouts data
 * @param {Array<Object>} bookings - Array of booking objects
 * @param {Array<Object>} checkouts - Array of checkout objects
 * @param {Object} circulationRules - Circulation rules configuration
 * @returns {IntervalTree} Populated interval tree ready for queries
 */
export function buildIntervalTree(bookings, checkouts, circulationRules) {
    const tree = new IntervalTree();

    bookings.forEach(booking => {
        try {
            if (!booking.item_id || !booking.start_date || !booking.end_date) {
                logger.warn("Skipping invalid booking", { booking });
                return;
            }

            const bookingInterval = new BookingInterval(
                booking.start_date,
                booking.end_date,
                booking.item_id,
                "booking",
                { booking_id: booking.booking_id, patron_id: booking.patron_id }
            );
            tree.insert(bookingInterval);

            const leadDays = circulationRules?.bookings_lead_period || 0;
            if (leadDays > 0) {
                const bookingStart = BookingDate.from(booking.start_date);
                const leadStart = bookingStart.subtractDays(leadDays);
                const leadEnd = bookingStart.subtractDays(1);
                const leadInterval = new BookingInterval(
                    leadStart.toDate(),
                    leadEnd.toDate(),
                    booking.item_id,
                    "lead",
                    { booking_id: booking.booking_id, days: leadDays }
                );
                tree.insert(leadInterval);
            }

            const trailDays = circulationRules?.bookings_trail_period || 0;
            if (trailDays > 0) {
                const bookingEnd = BookingDate.from(booking.end_date);
                const trailStart = bookingEnd.addDays(1);
                const trailEnd = bookingEnd.addDays(trailDays);
                const trailInterval = new BookingInterval(
                    trailStart.toDate(),
                    trailEnd.toDate(),
                    booking.item_id,
                    "trail",
                    { booking_id: booking.booking_id, days: trailDays }
                );
                tree.insert(trailInterval);
            }
        } catch (error) {
            logger.error("Failed to insert booking interval", {
                booking,
                error,
            });
        }
    });

    checkouts.forEach(checkout => {
        try {
            if (
                checkout.item_id &&
                checkout.checkout_date &&
                checkout.due_date
            ) {
                const checkoutInterval = new BookingInterval(
                    checkout.checkout_date,
                    checkout.due_date,
                    checkout.item_id,
                    "checkout",
                    {
                        checkout_id: checkout.issue_id,
                        patron_id: checkout.patron_id,
                    }
                );
                tree.insert(checkoutInterval);
            }
        } catch (error) {
            logger.error("Failed to insert checkout interval", {
                checkout,
                error,
            });
        }
    });

    return tree;
}
