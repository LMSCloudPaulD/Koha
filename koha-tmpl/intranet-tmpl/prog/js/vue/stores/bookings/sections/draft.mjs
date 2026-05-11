import { ref, computed } from "vue";

/**
 * Draft section: the booking-in-progress.
 *
 * Holds the user-mutable booking fields (patron, item, library,
 * dates) plus thin derived getters that normalize the draft for
 * downstream consumption.
 *
 * Date-type policy: `selectedDateRange` is canonical ISO 8601 strings
 * so the same value can be persisted, sent to the API, and round-
 * tripped through the picker. Widgets (Flatpickr) work with Date
 * objects and convert at the boundary; computation utilities convert
 * ISO → Date close to the boundary; API payloads use ISO as-is.
 *
 * `pickerModelValue` and `rangeAnchor` perform the ISO → Date
 * conversion centrally so the picker, the calendar-maps composable,
 * and any future consumer all see the same shape; previously each
 * call site recomputed it. `setSelectedDates` enforces the inverse
 * (Date → ISO) plus the [a] / [a, b] / [] shape invariant.
 */
export function useDraftSection() {
    /** @type {import('vue').Ref<import('@koha-vue/components/Bookings/types/bookings').Id | null>} */
    const bookingId = ref(null);
    /** @type {import('vue').Ref<import('@koha-vue/components/Bookings/types/bookings').Id | null>} kept for backward compatibility */
    const bookingItemId = ref(null);
    /** @type {import('vue').Ref<import('@koha-vue/components/Bookings/types/bookings').PatronOption | null>} */
    const bookingPatron = ref(null);
    /** @type {import('vue').Ref<import('@koha-vue/components/Bookings/types/bookings').Id | null>} kept for backward compatibility */
    const bookingItemtypeId = ref(null);
    /** @type {import('vue').Ref<import('@koha-vue/components/Bookings/types/bookings').Id | null>} */
    const patronId = ref(null);
    /** @type {import('vue').Ref<string | null>} */
    const pickupLibraryId = ref(null);
    /** @type {import('vue').Ref<string[]>} ISO 8601 strings; see module docstring */
    const selectedDateRange = ref([]);

    /**
     * ISO[] (store) → Date[] | null at flatpickr's range model:
     *   - empty / null-anchor → null
     *   - length 1 → [anchor]   (picking-end)
     *   - length 2 → [start, end]   (committed)
     *
     * @type {import('vue').ComputedRef<Date[] | null>}
     */
    const pickerModelValue = computed(() => {
        const range = selectedDateRange.value;
        if (
            !Array.isArray(range) ||
            range.length === 0 ||
            range[0] == null
        ) {
            return null;
        }
        if (range.length === 1) return [new Date(range[0])];
        return [new Date(range[0]), new Date(range[1])];
    });

    /**
     * Anchor (start) of the current draft range, as a Date, or null
     * when no anchor is set. Used by the calendar-maps composable to
     * decide soft-vs-hard severity and constrained-range highlights.
     *
     * @type {import('vue').ComputedRef<Date | null>}
     */
    const rangeAnchor = computed(() => {
        const v = pickerModelValue.value;
        if (Array.isArray(v) && v.length >= 1 && v[0] instanceof Date) {
            return v[0];
        }
        return null;
    });

    /**
     * Earliest selectable date: tomorrow at midnight. Past-date
     * hard-disabling is also enforced inside createDisableFunction;
     * pinning minDate keeps flatpickr from rendering today as a hover
     * target.
     *
     * @type {import('vue').ComputedRef<Date>}
     */
    const minDate = computed(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 1);
        return d;
    });

    /**
     * Write a Date-shaped picker value back into the store as the
     * canonical ISO[] form. Accepts the full BaseFlatpickr emit shape
     * (Date | [Date, Date] | Date[] | null) and enforces the
     * [a] / [a, b] / [] invariant on `selectedDateRange`.
     *
     * @param {Date | Date[] | [Date, Date] | null} v
     */
    function setSelectedDates(v) {
        if (!v) {
            selectedDateRange.value = [];
            return;
        }
        if (Array.isArray(v)) {
            selectedDateRange.value = v
                .filter(d => d instanceof Date)
                .map(d => d.toISOString());
            return;
        }
        if (v instanceof Date) {
            selectedDateRange.value = [v.toISOString()];
        }
    }

    return {
        bookingId,
        bookingItemId,
        bookingPatron,
        bookingItemtypeId,
        patronId,
        pickupLibraryId,
        selectedDateRange,

        pickerModelValue,
        rangeAnchor,
        minDate,

        setSelectedDates,
    };
}
