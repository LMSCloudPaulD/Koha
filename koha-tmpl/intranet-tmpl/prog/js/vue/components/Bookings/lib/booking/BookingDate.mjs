/**
 * BookingDate - Unified date adapter for the booking system.
 *
 * This class encapsulates all date operations and provides consistent
 * conversions between different date representations used throughout
 * the booking system:
 *
 * - ISO 8601 strings: Used in the Pinia store (single source of truth)
 * - Date objects: Used by Flatpickr widget
 * - dayjs instances: Used for all calculations
 * - API format (YYYY-MM-DD): Used in REST API payloads
 *
 * By centralizing date handling, we eliminate scattered conversion calls
 * and reduce the risk of timezone-related bugs.
 *
 * @example
 * // Creating BookingDate instances
 * const date1 = BookingDate.from('2025-03-14T00:00:00.000Z');
 * const date2 = BookingDate.from(new Date());
 * const date3 = BookingDate.today();
 *
 * // Converting to different formats
 * date1.toISO();        // '2025-03-14T00:00:00.000Z'
 * date1.toDate();       // Date object
 * date1.toAPIFormat();  // '2025-03-14'
 *
 * // Arithmetic
 * const nextWeek = date1.addDays(7);
 * const lastMonth = date1.subtractMonths(1);
 *
 * // Comparisons
 * date1.isBefore(date2);
 * date1.isSameDay(date2);
 *
 * @module BookingDate
 */

import dayjs from "../../../../utils/dayjs.mjs";

/**
 * Immutable date wrapper for booking operations.
 * All arithmetic operations return new BookingDate instances.
 */
export class BookingDate {
    /** @type {import('dayjs').Dayjs} */
    #dayjs;

    /**
     * Create a BookingDate from any date-like input.
     * The date is normalized to start of day to avoid time-related issues.
     *
     * @param {string|number|Date|import('dayjs').Dayjs|BookingDate} input - Date input (string, timestamp, Date, dayjs, or BookingDate)
     * @param {Object} [options]
     * @param {boolean} [options.preserveTime=false] - If true, don't normalize to start of day
     */
    constructor(input, options = {}) {
        if (input instanceof BookingDate) {
            this.#dayjs = input.#dayjs.clone();
        } else {
            this.#dayjs = dayjs(
                /** @type {import('dayjs').ConfigType} */ (input)
            );
        }

        if (!options.preserveTime) {
            this.#dayjs = this.#dayjs.startOf("day");
        }

        if (!this.#dayjs.isValid()) {
            throw new Error(`Invalid date input: ${input}`);
        }
    }

    // =========================================================================
    // Static Factory Methods
    // =========================================================================

    /**
     * Create a BookingDate from any date-like input.
     * Preferred factory method for creating instances.
     *
     * @param {string|number|Date|import('dayjs').Dayjs|BookingDate|null|undefined} input
     * @param {Object} [options]
     * @param {boolean} [options.preserveTime=false]
     * @returns {BookingDate|null} Returns null if input is null/undefined
     */
    static from(input, options = {}) {
        if (input == null) return null;
        if (input instanceof BookingDate) return input;
        return new BookingDate(input, options);
    }

    /**
     * Create a BookingDate for today (start of day).
     * @returns {BookingDate}
     */
    static today() {
        return new BookingDate(dayjs());
    }

    /**
     * Create a BookingDate from an ISO string.
     * @param {string} isoString
     * @returns {BookingDate}
     */
    static fromISO(isoString) {
        return new BookingDate(isoString);
    }

    /**
     * Create a BookingDate from a Date object.
     * @param {Date} date
     * @returns {BookingDate}
     */
    static fromDate(date) {
        return new BookingDate(date);
    }

    /**
     * Create a BookingDate from API format (YYYY-MM-DD).
     * @param {string} apiDate
     * @returns {BookingDate}
     */
    static fromAPIFormat(apiDate) {
        return new BookingDate(apiDate);
    }

    /**
     * Convert an array of ISO strings to BookingDate array.
     * Filters out null/invalid values.
     *
     * @param {Array<string|null|undefined>} isoArray
     * @returns {BookingDate[]}
     */
    static fromISOArray(isoArray) {
        if (!Array.isArray(isoArray)) return [];
        return isoArray
            .filter(Boolean)
            .map(iso => BookingDate.fromISO(iso))
            .filter(d => d !== null);
    }

    /**
     * Convert an array of BookingDates to ISO strings.
     * @param {BookingDate[]} dates
     * @returns {string[]}
     */
    static toISOArray(dates) {
        if (!Array.isArray(dates)) return [];
        return dates.filter(d => d instanceof BookingDate).map(d => d.toISO());
    }

    /**
     * Convert an array of BookingDates to Date objects.
     * Used for Flatpickr integration.
     * @param {BookingDate[]} dates
     * @returns {Date[]}
     */
    static toDateArray(dates) {
        if (!Array.isArray(dates)) return [];
        return dates.filter(d => d instanceof BookingDate).map(d => d.toDate());
    }

    // =========================================================================
    // Conversion Methods (Output)
    // =========================================================================

    /**
     * Convert to ISO 8601 string for store storage.
     * @returns {string}
     */
    toISO() {
        return this.#dayjs.toISOString();
    }

    /**
     * Convert to native Date object for Flatpickr.
     * @returns {Date}
     */
    toDate() {
        return this.#dayjs.toDate();
    }

    /**
     * Convert to dayjs instance for complex calculations.
     * Returns a clone to maintain immutability.
     * @returns {import('dayjs').Dayjs}
     */
    toDayjs() {
        return this.#dayjs.clone();
    }

    /**
     * Convert to API format (YYYY-MM-DD) for REST payloads.
     * @returns {string}
     */
    toAPIFormat() {
        return this.#dayjs.format("YYYY-MM-DD");
    }

    /**
     * Format date with custom pattern.
     * @param {string} pattern - dayjs format pattern
     * @returns {string}
     */
    format(pattern) {
        return this.#dayjs.format(pattern);
    }

    /**
     * Get Unix timestamp in milliseconds.
     * @returns {number}
     */
    valueOf() {
        return this.#dayjs.valueOf();
    }

    /**
     * Get Unix timestamp in milliseconds (alias for valueOf).
     * @returns {number}
     */
    getTime() {
        return this.valueOf();
    }

    /**
     * String representation (ISO format).
     * @returns {string}
     */
    toString() {
        return this.toISO();
    }

    // =========================================================================
    // Arithmetic Methods (Return new BookingDate)
    // =========================================================================

    /**
     * Add days to the date.
     * @param {number} days
     * @returns {BookingDate}
     */
    addDays(days) {
        return new BookingDate(this.#dayjs.add(days, "day"));
    }

    /**
     * Subtract days from the date.
     * @param {number} days
     * @returns {BookingDate}
     */
    subtractDays(days) {
        return new BookingDate(this.#dayjs.subtract(days, "day"));
    }

    /**
     * Add months to the date.
     * @param {number} months
     * @returns {BookingDate}
     */
    addMonths(months) {
        return new BookingDate(this.#dayjs.add(months, "month"));
    }

    /**
     * Subtract months from the date.
     * @param {number} months
     * @returns {BookingDate}
     */
    subtractMonths(months) {
        return new BookingDate(this.#dayjs.subtract(months, "month"));
    }

    /**
     * Add years to the date.
     * @param {number} years
     * @returns {BookingDate}
     */
    addYears(years) {
        return new BookingDate(this.#dayjs.add(years, "year"));
    }

    /**
     * Subtract years from the date.
     * @param {number} years
     * @returns {BookingDate}
     */
    subtractYears(years) {
        return new BookingDate(this.#dayjs.subtract(years, "year"));
    }

    // =========================================================================
    // Comparison Methods
    // =========================================================================

    /**
     * Check if this date is before another date.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isBefore(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return false;
        return this.#dayjs.isBefore(otherDate.#dayjs, unit);
    }

    /**
     * Check if this date is after another date.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isAfter(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return false;
        return this.#dayjs.isAfter(otherDate.#dayjs, unit);
    }

    /**
     * Check if this date is the same as another date.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isSame(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return false;
        return this.#dayjs.isSame(otherDate.#dayjs, unit);
    }

    /**
     * Check if this date is the same day as another date.
     * Convenience method for isSame(other, 'day').
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @returns {boolean}
     */
    isSameDay(other) {
        return this.isSame(other, "day");
    }

    /**
     * Check if this date is the same or before another date.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isSameOrBefore(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return false;
        return this.#dayjs.isSameOrBefore(otherDate.#dayjs, unit);
    }

    /**
     * Check if this date is the same or after another date.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isSameOrAfter(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return false;
        return this.#dayjs.isSameOrAfter(otherDate.#dayjs, unit);
    }

    /**
     * Check if this date is between two other dates (inclusive).
     * Implemented using isSameOrAfter/isSameOrBefore since the isBetween plugin is not loaded.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} start
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} end
     * @param {'day'|'month'|'year'} [unit='day']
     * @returns {boolean}
     */
    isBetween(start, end, unit = "day") {
        const startDate = BookingDate.from(start);
        const endDate = BookingDate.from(end);
        if (!startDate || !endDate) return false;
        return (
            this.isSameOrAfter(startDate, unit) &&
            this.isSameOrBefore(endDate, unit)
        );
    }

    /**
     * Get the difference between this date and another.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @param {'day'|'month'|'year'|'hour'|'minute'|'second'} [unit='day']
     * @returns {number}
     */
    diff(other, unit = "day") {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return 0;
        return this.#dayjs.diff(otherDate.#dayjs, unit);
    }

    /**
     * Compare two dates, returning -1, 0, or 1.
     * Useful for array sorting.
     * @param {string|Date|import('dayjs').Dayjs|BookingDate} other
     * @returns {-1|0|1}
     */
    compare(other) {
        const otherDate = BookingDate.from(other);
        if (!otherDate) return 1;
        if (this.isBefore(otherDate)) return -1;
        if (this.isAfter(otherDate)) return 1;
        return 0;
    }

    // =========================================================================
    // Component Accessors
    // =========================================================================

    /**
     * Get the year.
     * @returns {number}
     */
    year() {
        return this.#dayjs.year();
    }

    /**
     * Get the month (0-11).
     * @returns {number}
     */
    month() {
        return this.#dayjs.month();
    }

    /**
     * Get the day of month (1-31).
     * @returns {number}
     */
    date() {
        return this.#dayjs.date();
    }

    /**
     * Get the day of week (0-6, Sunday is 0).
     * @returns {number}
     */
    day() {
        return this.#dayjs.day();
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /**
     * Check if the date is valid.
     * @returns {boolean}
     */
    isValid() {
        return this.#dayjs.isValid();
    }

    /**
     * Clone this BookingDate.
     * @returns {BookingDate}
     */
    clone() {
        return new BookingDate(this.#dayjs.clone());
    }

    /**
     * Check if this date is today.
     * @returns {boolean}
     */
    isToday() {
        return this.isSameDay(BookingDate.today());
    }

    /**
     * Check if this date is in the past (before today).
     * @returns {boolean}
     */
    isPast() {
        return this.isBefore(BookingDate.today());
    }

    /**
     * Check if this date is in the future (after today).
     * @returns {boolean}
     */
    isFuture() {
        return this.isAfter(BookingDate.today());
    }
}

// =========================================================================
// Standalone Helper Functions
// =========================================================================

/**
 * Convert an array of ISO strings to Date objects.
 * @param {Array<string>} values
 * @returns {Date[]}
 */
export function isoArrayToDates(values) {
    return BookingDate.toDateArray(BookingDate.fromISOArray(values));
}

/**
 * Convert any date input to ISO string.
 * @param {string|Date|import('dayjs').Dayjs} input
 * @returns {string}
 */
export function toISO(input) {
    const bd = BookingDate.from(input);
    return bd ? bd.toISO() : "";
}

/**
 * Convert any date input to dayjs instance.
 * @param {string|Date|import('dayjs').Dayjs} input
 * @returns {import('dayjs').Dayjs}
 */
export function toDayjs(input) {
    const bd = BookingDate.from(input);
    return bd ? bd.toDayjs() : dayjs();
}

/**
 * Get start-of-day timestamp for any date input.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @returns {number}
 */
export function startOfDayTs(input) {
    const bd = BookingDate.from(input);
    return bd ? bd.valueOf() : 0;
}

/**
 * Format any date input as YYYY-MM-DD.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @returns {string}
 */
export function formatYMD(input) {
    const bd = BookingDate.from(input);
    return bd ? bd.toAPIFormat() : "";
}

/**
 * Add days to any date input.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @param {number} days
 * @returns {import('dayjs').Dayjs}
 */
export function addDays(input, days) {
    const bd = BookingDate.from(input);
    return bd ? bd.addDays(days).toDayjs() : dayjs();
}

/**
 * Subtract days from any date input.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @param {number} days
 * @returns {import('dayjs').Dayjs}
 */
export function subDays(input, days) {
    const bd = BookingDate.from(input);
    return bd ? bd.subtractDays(days).toDayjs() : dayjs();
}

/**
 * Add months to any date input.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @param {number} months
 * @returns {import('dayjs').Dayjs}
 */
export function addMonths(input, months) {
    const bd = BookingDate.from(input);
    return bd ? bd.addMonths(months).toDayjs() : dayjs();
}

/**
 * Get end-of-day timestamp for any date input.
 * @param {string|Date|import('dayjs').Dayjs|BookingDate} input
 * @returns {number}
 */
export function endOfDayTs(input) {
    const bd = BookingDate.from(input, { preserveTime: true });
    return bd ? bd.toDayjs().endOf("day").valueOf() : 0;
}

// Default export for convenience
export default BookingDate;
