import { ref, computed } from "vue";
import { useBookingCalendarMaps } from "../../../components/Bookings/composables/useBookingCalendarMaps.mjs";
import {
    calculateDisabledDates,
    calculateMaxBookingPeriod,
    toEffectiveRules,
} from "../../../components/Bookings/lib/booking/availability.mjs";
import { isoArrayToDates } from "../../../components/Bookings/lib/booking/BookingDate.mjs";
import {
    constrainBookableItems,
    constrainItemTypes,
    constrainPickupLocations,
} from "../../../components/Bookings/lib/booking/constraints.mjs";

/**
 * Availability section: derived view of the world based on Data + Draft.
 *
 * Owns the picker viewport, constraint configuration, and the
 * calendar-map outputs (disabledFn / disabledByDate / markersByDate /
 * classByDate / rangePreviewFn / loanBoundaryTimes) produced by
 * useBookingCalendarMaps, plus an `unavailableByDate` getter whose
 * lead-from-today and theoretical-lead markers the calendar-maps
 * composable does not include.
 *
 * Inputs that originate outside the store:
 *  - viewport: the picker's currently-visible month range; the modal
 *    pushes it via setViewport when the user paginates
 *  - dateRangeConstraint, customDateRangeFormula: configuration set
 *    once at modal mount via configureConstraints
 */
export function useAvailabilitySection({ data, draft }) {
    /** @type {import('vue').Ref<{ start: Date, end: Date } | null>} */
    const viewport = ref(null);

    /** @type {import('vue').Ref<string | null>} */
    const dateRangeConstraint = ref(null);

    /** @type {import('vue').Ref<((rules: import('@koha-vue/components/Bookings/types/bookings').CirculationRule) => number | null) | null>} */
    const customDateRangeFormula = ref(null);

    /**
     * Push the picker's currently-visible month range. Pass `null` to
     * clear (e.g., when the picker unmounts). The map computations
     * scope themselves to this window for performance.
     */
    function setViewport(range) {
        viewport.value = range && range.start && range.end ? range : null;
    }

    /**
     * Register the constraint configuration for the lifetime of the
     * current modal session. Both fields are stable per-session; the
     * modal calls this once at mount.
     *
     * @param {Object} [opts]
     * @param {string | null} [opts.dateRangeConstraint]
     * @param {((rules: import('@koha-vue/components/Bookings/types/bookings').CirculationRule) => number | null) | null} [opts.customDateRangeFormula]
     */
    function configureConstraints(opts) {
        const { dateRangeConstraint: drc = null, customDateRangeFormula: formula = null } =
            opts || {};
        dateRangeConstraint.value = drc;
        customDateRangeFormula.value = formula;
    }

    const maxBookingPeriod = computed(() =>
        calculateMaxBookingPeriod(
            data.circulationRules.value,
            dateRangeConstraint.value,
            customDateRangeFormula.value
        )
    );

    const constraintOptions = computed(() => ({
        dateRangeConstraint: dateRangeConstraint.value,
        maxBookingPeriod: maxBookingPeriod.value,
    }));

    // Constraint filtering of pickup locations / bookable items / item
    // types based on the current draft selections. The three constrain*
    // calls are bundled into a single `constraints` computed so all
    // four downstream views (filtered lists, totals, filtered-out
    // counts, applied flags) share one evaluation per input change.
    const constraints = computed(() => {
        const pickup = constrainPickupLocations(
            data.pickupLocations.value,
            data.bookableItems.value,
            draft.bookingItemtypeId.value,
            draft.bookingItemId.value
        );
        const items = constrainBookableItems(
            data.bookableItems.value,
            data.pickupLocations.value,
            draft.pickupLibraryId.value,
            draft.bookingItemtypeId.value
        );
        const types = constrainItemTypes(
            data.itemTypes.value,
            data.bookableItems.value,
            data.pickupLocations.value,
            draft.pickupLibraryId.value,
            draft.bookingItemId.value
        );
        return {
            pickupLocations: pickup,
            bookableItems: items,
            itemTypes: types,
            flags: {
                pickupLocations: pickup.constraintApplied,
                bookableItems: items.constraintApplied,
                itemTypes: types.constraintApplied,
            },
        };
    });

    const constrainedFlags = computed(() => constraints.value.flags);
    const constrainedPickupLocations = computed(
        () => constraints.value.pickupLocations.filtered
    );
    const constrainedBookableItems = computed(
        () => constraints.value.bookableItems.filtered
    );
    const constrainedItemTypes = computed(
        () => constraints.value.itemTypes.filtered
    );
    const pickupLocationsFilteredOut = computed(
        () => constraints.value.pickupLocations.filteredOutCount
    );
    const pickupLocationsTotal = computed(
        () => constraints.value.pickupLocations.total
    );
    const bookableItemsFilteredOut = computed(
        () => constraints.value.bookableItems.filteredOutCount
    );
    const bookableItemsTotal = computed(
        () => constraints.value.bookableItems.total
    );

    // Composables invoked inside the store's setup run in a Vue
    // reactive context the same as if they were called from a
    // component setup. Their outputs are computed refs that update
    // whenever the input refs change, so consumers reading these via
    // storeToRefs get the same reactivity as before the move.
    const maps = useBookingCalendarMaps({
        bookableItems: data.bookableItems,
        bookings: data.bookings,
        checkouts: data.checkouts,
        holidays: data.holidays,
        editBookingId: draft.bookingId,
        selectedDateRange: draft.selectedDateRange,
        constraintOptions,
        visibleRange: viewport,
        rangeAnchor: draft.rangeAnchor,
        maxBookingPeriod,
        bookingItemId: draft.bookingItemId,
        bookingItemtypeId: draft.bookingItemtypeId,
        circulationRules: data.circulationRules,
    });

    // Compute availability directly (formerly via useAvailability):
    // calculateDisabledDates produces both a Flatpickr disable function
    // and an unavailable-by-date map that includes the lead-from-today
    // and theoretical-lead markers the calendar-maps composable omits.
    // We expose only the map; the disable function is unused here
    // because the picker drives off useBookingCalendarMaps' disabledFn.
    /** @type {import('vue').ComputedRef<import('@koha-vue/components/Bookings/types/bookings').UnavailableByDate>} */
    const unavailableByDate = computed(() => {
        const inputsReady =
            Array.isArray(data.bookings.value) &&
            Array.isArray(data.checkouts.value) &&
            Array.isArray(data.bookableItems.value) &&
            (data.bookableItems.value?.length ?? 0) > 0;
        if (!inputsReady) return {};

        const effectiveRules = toEffectiveRules(
            data.circulationRules.value,
            constraintOptions.value || {}
        );

        const calcOptions = {
            holidays: data.holidays?.value || [],
        };
        if (viewport.value?.start && viewport.value?.end) {
            calcOptions.onDemand = true;
            calcOptions.visibleStartDate = viewport.value.start;
            calcOptions.visibleEndDate = viewport.value.end;
        }

        return calculateDisabledDates(
            data.bookings.value,
            data.checkouts.value,
            data.bookableItems.value,
            draft.bookingItemId.value,
            draft.bookingId.value,
            isoArrayToDates(draft.selectedDateRange.value || []),
            effectiveRules,
            undefined,
            calcOptions
        ).unavailableByDate;
    });

    return {
        viewport,
        dateRangeConstraint,
        customDateRangeFormula,
        maxBookingPeriod,
        constraintOptions,

        constraints,
        constrainedFlags,
        constrainedPickupLocations,
        constrainedBookableItems,
        constrainedItemTypes,
        pickupLocationsFilteredOut,
        pickupLocationsTotal,
        bookableItemsFilteredOut,
        bookableItemsTotal,

        disabledFn: maps.disabledFn,
        disabledByDate: maps.disabledByDate,
        markersByDate: maps.markersByDate,
        classByDate: maps.classByDate,
        rangePreviewFn: maps.rangePreviewFn,
        loanBoundaryTimes: maps.loanBoundaryTimes,

        unavailableByDate,

        setViewport,
        configureConstraints,
    };
}
