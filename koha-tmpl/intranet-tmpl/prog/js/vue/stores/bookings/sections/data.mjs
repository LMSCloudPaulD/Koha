import { ref, computed } from "vue";
import * as bookingApi from "@bookingApi";
import {
    transformPatronData,
    transformPatronsData,
} from "../../../components/Bookings/lib/adapters/patron.mjs";
import {
    formatYMD,
    addMonths,
    addDays,
} from "../../../components/Bookings/lib/booking/BookingDate.mjs";
import {
    HOLIDAY_PREFETCH_THRESHOLD_DAYS,
    HOLIDAY_PREFETCH_MONTHS,
} from "../../../components/Bookings/lib/booking/constants.mjs";
import { makeWithErrorHandling } from "../utils/withErrorHandling.mjs";

/**
 * Data section: collections fetched from the API and the actions that
 * fetch / mutate them.
 *
 * State:
 *  - bookableItems, bookings, checkouts, pickupLocations, itemTypes,
 *    circulationRules, holidays — domain collections.
 *  - circulationRulesContext, holidaysFetchedRange — fetch-bookkeeping
 *    used to decide whether a refetch / range extension is needed.
 *
 * Getters:
 *  - effectiveCirculationRules — first rule or {} (the rules array is
 *    always shaped as a 0/1-element list per the API contract).
 */
export function useDataSection({ status }) {
    const withErrorHandling = makeWithErrorHandling(
        status.loading,
        status.error
    );

    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').BookableItem>>} */
    const bookableItems = ref([]);
    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').Booking>>} */
    const bookings = ref([]);
    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').Checkout>>} */
    const checkouts = ref([]);
    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').PickupLocation>>} */
    const pickupLocations = ref([]);
    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').ItemType>>} */
    const itemTypes = ref([]);
    /** @type {import('vue').Ref<Array<import('@koha-vue/components/Bookings/types/bookings').CirculationRule>>} */
    const circulationRules = ref([]);
    /** Tracks the context used for the last rules fetch (for cache invalidation) */
    const circulationRulesContext = ref(null);
    /** @type {import('vue').Ref<string[]>} Closed days for the selected pickup library */
    const holidays = ref([]);
    /** @type {import('vue').Ref<{ from: string|null, to: string|null, libraryId: string|null }>} */
    const holidaysFetchedRange = ref({
        from: null,
        to: null,
        libraryId: null,
    });

    const effectiveCirculationRules = computed(
        () => circulationRules.value?.[0] || {}
    );

    /**
     * Invalidate backend-calculated due values to avoid stale UI when
     * inputs change. Keeps the rules object shape but removes
     * calculated fields so consumers fall back to maxPeriod-based logic
     * until fresh rules arrive.
     */
    function invalidateCalculatedDue() {
        if (
            Array.isArray(circulationRules.value) &&
            circulationRules.value.length > 0
        ) {
            const first = { ...circulationRules.value[0] };
            if ("calculated_due_date" in first) delete first.calculated_due_date;
            if ("calculated_period_days" in first)
                delete first.calculated_period_days;
            circulationRules.value = [first];
        }
    }

    const fetchBookableItems = withErrorHandling(async function (biblionumber) {
        const data = await bookingApi.fetchBookableItems(biblionumber);
        bookableItems.value = data;
        return data;
    }, "bookableItems");

    const fetchBookings = withErrorHandling(async function (biblionumber) {
        const data = await bookingApi.fetchBookings(biblionumber);
        bookings.value = data;
        return data;
    }, "bookings");

    const fetchCheckouts = withErrorHandling(async function (biblionumber) {
        const data = await bookingApi.fetchCheckouts(biblionumber);
        checkouts.value = data;
        return data;
    }, "checkouts");

    const fetchPatron = withErrorHandling(async function (patronId) {
        const data = await bookingApi.fetchPatron(patronId);
        return transformPatronData(Array.isArray(data) ? data[0] : data);
    }, "bookingPatron");

    const fetchPatrons = withErrorHandling(async function (term, page = 1) {
        const data = await bookingApi.fetchPatrons(term, page);
        return transformPatronsData(data);
    }, "patrons");

    const fetchPickupLocations = withErrorHandling(async function (
        biblionumber,
        patron_id
    ) {
        const data = await bookingApi.fetchPickupLocations(
            biblionumber,
            patron_id
        );
        pickupLocations.value = data;
        return data;
    }, "pickupLocations");

    const fetchCirculationRules = withErrorHandling(async function (params) {
        // Only include defined (non-null, non-undefined, non-empty) params
        const filteredParams = {};
        for (const key in params) {
            if (
                params[key] !== null &&
                params[key] !== undefined &&
                params[key] !== ""
            ) {
                filteredParams[key] = params[key];
            }
        }
        const data = await bookingApi.fetchCirculationRules(filteredParams);
        circulationRules.value = data;
        circulationRulesContext.value = {
            patron_category_id: filteredParams.patron_category_id ?? null,
            item_type_id: filteredParams.item_type_id ?? null,
            library_id: filteredParams.library_id ?? null,
        };
        return data;
    }, "circulationRules");

    /**
     * Fetch holidays for a library; tracks fetched range and accumulates
     * to support on-demand extension when the user paginates the picker.
     */
    const fetchHolidays = withErrorHandling(async function (
        libraryId,
        from,
        to
    ) {
        if (!libraryId) {
            holidays.value = [];
            holidaysFetchedRange.value = {
                from: null,
                to: null,
                libraryId: null,
            };
            return [];
        }

        // If library changed, reset and fetch fresh
        const fetchedRange = holidaysFetchedRange.value || {
            from: null,
            to: null,
            libraryId: null,
        };
        if (fetchedRange.libraryId !== libraryId) {
            holidays.value = [];
            holidaysFetchedRange.value = {
                from: null,
                to: null,
                libraryId: null,
            };
        }

        const data = await bookingApi.fetchHolidays(libraryId, from, to);

        // Accumulate via Set to avoid duplicates
        const existingSet = new Set(holidays.value);
        data.forEach(date => existingSet.add(date));
        holidays.value = Array.from(existingSet).sort();

        const currentFrom = holidaysFetchedRange.value.from;
        const currentTo = holidaysFetchedRange.value.to;
        holidaysFetchedRange.value = {
            libraryId,
            from: !currentFrom || from < currentFrom ? from : currentFrom,
            to: !currentTo || to > currentTo ? to : currentTo,
        };

        return data;
    }, "holidays");

    /**
     * Extend holidays range if the visible calendar range exceeds
     * fetched data. Also prefetches upcoming months when approaching
     * the edge of fetched data.
     */
    async function extendHolidaysIfNeeded(libraryId, visibleStart, visibleEnd) {
        if (!libraryId) return;

        const visibleFrom = formatYMD(visibleStart);
        const visibleTo = formatYMD(visibleEnd);

        const {
            from: fetchedFrom,
            to: fetchedTo,
            libraryId: fetchedLib,
        } = holidaysFetchedRange.value;

        // Different library or no data yet → fetch visible range + prefetch buffer
        if (fetchedLib !== libraryId || !fetchedFrom || !fetchedTo) {
            const prefetchEnd = formatYMD(addMonths(visibleEnd, 6));
            await fetchHolidays(libraryId, visibleFrom, prefetchEnd);
            return;
        }

        // YYYY-MM-DD strings are lexicographically sortable
        const needsExtensionBefore = visibleFrom < fetchedFrom;
        const needsExtensionAfter = visibleTo > fetchedTo;

        if (needsExtensionBefore) {
            const prefetchStart = formatYMD(addMonths(visibleStart, -3));
            const extensionEnd = formatYMD(addDays(fetchedFrom, -1));
            await fetchHolidays(libraryId, prefetchStart, extensionEnd);
        }
        if (needsExtensionAfter) {
            const extensionStart = formatYMD(addDays(fetchedTo, 1));
            const prefetchEnd = formatYMD(addMonths(visibleEnd, 6));
            await fetchHolidays(libraryId, extensionStart, prefetchEnd);
        }

        // Prefetch ahead if approaching the trailing edge
        if (!needsExtensionAfter && fetchedTo) {
            const daysToEdge = addDays(fetchedTo, 0).diff(visibleEnd, "day");
            if (daysToEdge < HOLIDAY_PREFETCH_THRESHOLD_DAYS) {
                const extensionStart = formatYMD(addDays(fetchedTo, 1));
                const prefetchEnd = formatYMD(
                    addMonths(fetchedTo, HOLIDAY_PREFETCH_MONTHS)
                );
                fetchHolidays(libraryId, extensionStart, prefetchEnd).catch(
                    () => {}
                );
            }
        }

        // Prefetch behind if approaching the leading edge
        if (!needsExtensionBefore && fetchedFrom) {
            const daysToEdge = addDays(visibleStart, 0).diff(fetchedFrom, "day");
            if (daysToEdge < HOLIDAY_PREFETCH_THRESHOLD_DAYS) {
                const prefetchStart = formatYMD(
                    addMonths(fetchedFrom, -HOLIDAY_PREFETCH_MONTHS)
                );
                const extensionEnd = formatYMD(addDays(fetchedFrom, -1));
                fetchHolidays(libraryId, prefetchStart, extensionEnd).catch(
                    () => {}
                );
            }
        }
    }

    function deriveItemTypesFromBookableItems() {
        const typesMap = {};
        bookableItems.value.forEach(item => {
            const typeId = item.effective_item_type_id || item.item_type_id;
            if (typeId) {
                const label = item._strings?.item_type_id?.str ?? typeId;
                typesMap[typeId] = label;
            }
        });
        itemTypes.value = Object.entries(typesMap).map(
            ([item_type_id, description]) => ({ item_type_id, description })
        );
    }

    /**
     * Save (POST) or update (PUT) a booking. If the payload carries a
     * booking id we update; otherwise we create.
     */
    const saveOrUpdateBooking = withErrorHandling(async function (bookingData) {
        let result;
        if (bookingData.bookingId || bookingData.booking_id) {
            const id = bookingData.bookingId || bookingData.booking_id;
            result = await bookingApi.updateBooking(id, bookingData);
            const idx = bookings.value.findIndex(
                b => b.booking_id === result.booking_id
            );
            if (idx !== -1) bookings.value[idx] = result;
        } else {
            result = await bookingApi.createBooking(bookingData);
            bookings.value.push(result);
        }
        return result;
    }, "submit");

    return {
        bookableItems,
        bookings,
        checkouts,
        pickupLocations,
        itemTypes,
        circulationRules,
        circulationRulesContext,
        holidays,
        holidaysFetchedRange,

        effectiveCirculationRules,

        invalidateCalculatedDue,
        fetchBookableItems,
        fetchBookings,
        fetchCheckouts,
        fetchPatron,
        fetchPatrons,
        fetchPickupLocations,
        fetchCirculationRules,
        fetchHolidays,
        extendHolidaysIfNeeded,
        deriveItemTypesFromBookableItems,
        saveOrUpdateBooking,
    };
}
