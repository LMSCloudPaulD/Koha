import { ref, computed, watch } from "vue";
import { canSubmitBooking } from "../../../components/Bookings/lib/booking/validation.js";
import { getAvailableItemsForPeriod } from "../../../components/Bookings/lib/booking/availability.js";
import { buildNoItemsAvailableMessage } from "../../../components/Bookings/lib/ui/selection-message.js";
import { $__ } from "../../../i18n/index.js";

/**
 * Validation section: submit-readiness predicates, capacity gating,
 * the messages that explain why a draft cannot ship, and the action
 * that assembles the submission payload.
 *
 * Owns the modal-level UI flags (showPatronSelect /
 * showItemDetailsSelects / showPickupLocationSelect). The modal sets
 * these once at mount via configureUi; downstream getters read them
 * to build context-aware messages and to know which fields a draft
 * has to fill in to be submittable.
 *
 * Owns the layered readiness predicates (dataReady, formPrefilterValid,
 * hasAvailableItems, isCalendarReady, isSubmitReady, readiness) the
 * modal previously computed inline. Same for the two top-level
 * watchers — clear-errors-on-input-change and the "no items available"
 * message synthesis — and the resolveItemForPeriod action that
 * encapsulates the 3-way item fallback (specific item / auto-pick /
 * itemtype) the modal previously inlined in handleSubmit.
 *
 * The capacity guard logic — hasPositiveCapacity, zeroCapacityMessage,
 * showCapacityWarning — was previously a standalone composable
 * (useCapacityGuard) called from BookingModal; it lives here now
 * because it's a pure function of store state plus the UI flags.
 * Same for canSubmit (formerly useBookingValidation).
 */
export function useValidationSection({ status, data, draft, availability }) {
    const showPatronSelect = ref(false);
    const showItemDetailsSelects = ref(false);
    const showPickupLocationSelect = ref(false);

    /**
     * Register the modal-level UI flags for the lifetime of the
     * current modal session. The modal calls this once at mount;
     * subsequent props changes (rare in practice) can be pushed via
     * another call.
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.showPatronSelect]
     * @param {boolean} [opts.showItemDetailsSelects]
     * @param {boolean} [opts.showPickupLocationSelect]
     */
    function configureUi(opts) {
        const o = opts || {};
        if ("showPatronSelect" in o)
            showPatronSelect.value = !!o.showPatronSelect;
        if ("showItemDetailsSelects" in o)
            showItemDetailsSelects.value = !!o.showItemDetailsSelects;
        if ("showPickupLocationSelect" in o)
            showPickupLocationSelect.value = !!o.showPickupLocationSelect;
    }

    const canSubmit = computed(() =>
        canSubmitBooking(
            {
                showPatronSelect: showPatronSelect.value,
                bookingPatron: draft.bookingPatron.value,
                showPickupLocationSelect: showPickupLocationSelect.value,
                pickupLibraryId: draft.pickupLibraryId.value,
                bookableItems: data.bookableItems.value,
            },
            draft.selectedDateRange.value
        )
    );

    // Capacity guard. A "positive capacity" means the effective
    // circulation rules yield a non-zero booking period under the
    // current dateRangeConstraint mode. When negative or unknown,
    // showCapacityWarning gates the calendar so the user sees a
    // context-aware reason rather than an unselectable picker.
    const hasPositiveCapacity = computed(() => {
        const rules = data.circulationRules.value?.[0] || {};
        const issuelength = Number(rules.issuelength) || 0;
        const renewalperiod = Number(rules.renewalperiod) || 0;
        const renewalsallowed = Number(rules.renewalsallowed) || 0;
        const withRenewals = issuelength + renewalperiod * renewalsallowed;

        const calculatedDays =
            rules.calculated_period_days != null
                ? Number(rules.calculated_period_days) || 0
                : null;

        const drc = availability.dateRangeConstraint.value;
        if (drc === "issuelength") return issuelength > 0;
        if (drc === "issuelength_with_renewals") return withRenewals > 0;

        if (calculatedDays != null) return calculatedDays > 0;
        return issuelength > 0 || withRenewals > 0;
    });

    const zeroCapacityMessage = computed(() => {
        const rules = data.circulationRules.value?.[0] || {};
        const issuelength = rules.issuelength;
        const hasExplicitZero =
            issuelength != null && Number(issuelength) === 0;
        const hasNull = issuelength === null || issuelength === undefined;

        const sps = showPatronSelect.value;
        const sids = showItemDetailsSelects.value;
        const spls = showPickupLocationSelect.value;

        if (hasExplicitZero) {
            if (sps && sids && spls) {
                return $__(
                    "Bookings are not permitted for this combination of patron category, item type, and pickup location. The circulation rules set the booking period to zero days."
                );
            }
            if (sids && spls) {
                return $__(
                    "Bookings are not permitted for this item type at the selected pickup location. The circulation rules set the booking period to zero days."
                );
            }
            if (sids) {
                return $__(
                    "Bookings are not permitted for this item type. The circulation rules set the booking period to zero days."
                );
            }
            return $__(
                "Bookings are not permitted for this item. The circulation rules set the booking period to zero days."
            );
        }

        if (hasNull) {
            const suggestions = [];
            if (sids) suggestions.push($__("item type"));
            if (spls) suggestions.push($__("pickup location"));
            if (sps) suggestions.push($__("patron"));

            if (suggestions.length > 0) {
                const suggestionText = suggestions.join($__(" or "));
                return $__(
                    "No circulation rule is defined for this combination. Try a different %s."
                ).replace("%s", suggestionText);
            }
        }

        const both = sids && spls;
        if (both) {
            return $__(
                "No valid booking period is available with the current selection. Try a different item type or pickup location."
            );
        }
        if (sids) {
            return $__(
                "No valid booking period is available with the current selection. Try a different item type."
            );
        }
        if (spls) {
            return $__(
                "No valid booking period is available with the current selection. Try a different pickup location."
            );
        }
        return $__(
            "No valid booking period is available for this record with your current settings. Please try again later or contact your library."
        );
    });

    const showCapacityWarning = computed(() => {
        const dataLoaded =
            !status.loading.bookings &&
            !status.loading.checkouts &&
            !status.loading.bookableItems;
        const hasItems = (data.bookableItems.value?.length ?? 0) > 0;
        const hasRules = (data.circulationRules.value?.length ?? 0) > 0;

        const ctx = data.circulationRulesContext.value;
        const hasCompleteContext =
            ctx &&
            ctx.patron_category_id != null &&
            ctx.item_type_id != null &&
            ctx.library_id != null;

        const rulesReady = !status.loading.circulationRules;

        return (
            dataLoaded &&
            rulesReady &&
            hasItems &&
            hasRules &&
            hasCompleteContext &&
            !hasPositiveCapacity.value
        );
    });

    // Readiness predicates: a layered description of how close the
    // current draft is to being submittable. The modal reads `readiness`
    // to decide which steps to enable; `isSubmitReady` gates the submit
    // button. Layered so consumers can disambiguate "not ready, waiting
    // on data" from "ready, but the user has not filled the form" from
    // "ready, but no items can satisfy the current selection".
    const dataReady = computed(
        () =>
            !status.loading.bookableItems &&
            !status.loading.bookings &&
            !status.loading.checkouts &&
            (data.bookableItems.value?.length ?? 0) > 0
    );
    const formPrefilterValid = computed(
        () => !showPatronSelect.value || !!draft.bookingPatron.value
    );
    const hasAvailableItems = computed(
        () => availability.constrainedBookableItems.value.length > 0
    );
    const isCalendarReady = computed(() => {
        const basicReady =
            dataReady.value &&
            formPrefilterValid.value &&
            hasAvailableItems.value;
        if (!basicReady) return false;
        if (status.loading.circulationRules) return true;
        return hasPositiveCapacity.value;
    });
    const isSubmitReady = computed(
        () => isCalendarReady.value && canSubmit.value
    );
    const readiness = computed(() => ({
        dataReady: dataReady.value,
        formPrefilterValid: formPrefilterValid.value,
        hasAvailableItems: hasAvailableItems.value,
        isCalendarReady: isCalendarReady.value,
    }));

    // Clear any pending API/UI errors as soon as the user changes any
    // submission-affecting input. Prevents stale "no items available"
    // or API failure messages from lingering after the user adjusts
    // the draft.
    watch(
        () => ({
            patron: draft.bookingPatron.value?.patron_id,
            pickup: draft.pickupLibraryId.value,
            itemtype: draft.bookingItemtypeId.value,
            item: draft.bookingItemId.value,
            d0: draft.selectedDateRange.value?.[0],
            d1: draft.selectedDateRange.value?.[1],
        }),
        (curr, prev) => {
            const inputsChanged =
                !prev ||
                curr.patron !== prev.patron ||
                curr.pickup !== prev.pickup ||
                curr.itemtype !== prev.itemtype ||
                curr.item !== prev.item ||
                curr.d0 !== prev.d0 ||
                curr.d1 !== prev.d1;
            if (inputsChanged) status.clearAllErrors();
        }
    );

    // Synthesize a "no items available" UI error when the draft is
    // otherwise complete but the constraint pipeline yields zero
    // bookable items. The watcher also clears its own message once the
    // condition no longer holds, so the flag does not stick.
    watch(
        [
            availability.constrainedBookableItems,
            () => draft.bookingPatron.value,
            () => draft.pickupLibraryId.value,
            () => draft.bookingItemtypeId.value,
            dataReady,
            () => status.loading.circulationRules,
            () => status.loading.pickupLocations,
        ],
        ([availableItems, patron, pickupLibrary, itemtypeId, isDataReady]) => {
            const pickupLocationsReady =
                !pickupLibrary ||
                (!status.loading.pickupLocations &&
                    data.pickupLocations.value.length > 0);
            const circulationRulesReady = !status.loading.circulationRules;

            if (
                isDataReady &&
                pickupLocationsReady &&
                circulationRulesReady &&
                patron &&
                (pickupLibrary || itemtypeId) &&
                availableItems.length === 0
            ) {
                const msg = buildNoItemsAvailableMessage(
                    data.pickupLocations.value,
                    data.itemTypes.value,
                    pickupLibrary,
                    itemtypeId
                );
                status.setUiError(msg, "no_items");
            } else if (status.uiError.code === "no_items") {
                status.clearAllErrors();
            }
        },
        { immediate: true }
    );

    /**
     * Resolve the item assignment for a draft submission given the
     * already-validated date range. Encapsulates the 3-way fallback
     * that was previously inline in BookingModal.handleSubmit:
     *  - A specific item is selected → returns `{ item_id }`.
     *  - No specific item, exactly one constrained item satisfies the
     *    period → auto-picks it and returns `{ item_id }`.
     *  - No specific item, multiple satisfy → returns `{ itemtype_id }`
     *    so the server picks.
     *  - No specific item, none satisfy → surfaces a "no available
     *    items" UI error and returns `{ ok: false }`.
     *
     * Exactly one of `item_id` / `itemtype_id` is populated when
     * `ok` is true; consumers can switch on which one is non-null.
     *
     * @param {Object} opts
     * @param {string} opts.start - Start date as ISO string
     * @param {string} opts.end - End date as ISO string
     * @param {string|number|null} [opts.bookingId] - Existing booking id
     *   to exclude from the availability calculation; null for create.
     * @returns {{ ok: true, item_id: string|number|null, itemtype_id: string|number|null } | { ok: false }}
     */
    function resolveItemForPeriod({ start, end, bookingId }) {
        if (draft.bookingItemId.value) {
            return {
                ok: true,
                item_id: draft.bookingItemId.value,
                itemtype_id: null,
            };
        }
        const available = getAvailableItemsForPeriod(
            start,
            end,
            availability.constrainedBookableItems.value,
            data.bookings.value,
            data.checkouts.value,
            data.circulationRules.value?.[0] || {},
            bookingId
        );
        if (available.length === 0) {
            status.setUiError(
                $__("No items available for the selected period"),
                "no_available_items"
            );
            return { ok: false };
        }
        if (available.length === 1) {
            return {
                ok: true,
                item_id: available[0].item_id,
                itemtype_id: null,
            };
        }
        return {
            ok: true,
            item_id: null,
            itemtype_id: draft.bookingItemtypeId.value,
        };
    }

    return {
        showPatronSelect,
        showItemDetailsSelects,
        showPickupLocationSelect,

        hasPositiveCapacity,
        zeroCapacityMessage,
        showCapacityWarning,

        dataReady,
        formPrefilterValid,
        hasAvailableItems,
        isCalendarReady,
        isSubmitReady,
        readiness,

        configureUi,
        resolveItemForPeriod,
    };
}
