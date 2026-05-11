import { computed, ref, watch } from "vue";
import {
    formatYMD,
    addMonths,
} from "../../../components/Bookings/lib/booking/BookingDate.js";
import { idsEqual } from "../../../components/Bookings/lib/booking/id-utils.js";

/**
 * Effects section: cross-cutting reactive bridges between data and
 * draft. Owns the watchers that previously lived in the
 * `useFormDefaults` and `useRulesFetcher` composables:
 *
 *  - Auto-fetch pickup locations / circulation rules / holidays when
 *    relevant draft inputs change (formerly useRulesFetcher).
 *  - Auto-set a sensible default pickup library and derive item type
 *    from the constrained options (formerly useFormDefaults).
 *
 * The biblionumber and OPAC defaults are external to the store and
 * captured once via `configureExternalInputs` from the modal at mount.
 * The watchers fire reactively from then on; the configure call is the
 * single bridge between the modal's props and the store's autoreact.
 */
export function useEffectsSection({ data, draft, availability }) {
    /** @type {import('vue').Ref<string|null>} */
    const biblionumber = ref(null);
    /** @type {import('vue').Ref<boolean|string|null>} */
    const opacDefaultBookingLibraryEnabled = ref(null);
    /** @type {import('vue').Ref<string|null>} */
    const opacDefaultBookingLibrary = ref(null);

    /** Last circulation-rules input key, used to dedupe redundant fetches. */
    const lastRulesKey = ref(null);
    /** Last library used for a holidays fetch, used to dedupe. */
    const lastHolidaysLibrary = ref(null);

    /**
     * Capture modal-level external inputs. Stable per modal session;
     * the modal calls this once at mount.
     *
     * @param {Object} [opts]
     * @param {string|number|null} [opts.biblionumber]
     * @param {boolean|string|null} [opts.opacDefaultBookingLibraryEnabled]
     * @param {string|null} [opts.opacDefaultBookingLibrary]
     */
    function configureExternalInputs(opts) {
        biblionumber.value = opts?.biblionumber
            ? String(opts.biblionumber)
            : null;
        opacDefaultBookingLibraryEnabled.value =
            opts?.opacDefaultBookingLibraryEnabled ?? null;
        opacDefaultBookingLibrary.value =
            opts?.opacDefaultBookingLibrary ?? null;
    }

    // Value-stable view of the constrained item types: a primitive id
    // when exactly one type remains, undefined otherwise. The filtered
    // array itself gets a fresh identity on every constraint
    // re-evaluation, so watching it directly would re-fire spuriously.
    const singleConstrainedItemTypeId = computed(() => {
        const types = availability.constrainedItemTypes.value;
        return Array.isArray(types) && types.length === 1
            ? types[0].item_type_id
            : undefined;
    });

    // Auto-fetch pickup locations when the biblio or patron changes.
    // Sources are explicit primitives: this effect WRITES (indirectly)
    // to data.pickupLocations, which feeds the constraint computeds —
    // auto-tracking those here would close a fetch feedback loop.
    watch(
        [biblionumber, () => draft.bookingPatron.value?.patron_id],
        ([biblio, patronId]) => {
            if (!biblio || !patronId) return;
            data.fetchPickupLocations(biblio, patronId);
        },
        { immediate: true, flush: "post" }
    );

    // Auto-fetch circulation rules whenever the inputs that compose the
    // rules-fetch key change. The watcher de-dupes via lastRulesKey.
    watch(
        [
            biblionumber,
            () => draft.bookingPatron.value?.category_id,
            () => draft.bookingItemtypeId.value,
            singleConstrainedItemTypeId,
            () => draft.pickupLibraryId.value,
        ],
        ([biblio, categoryId, itemtypeId, constrainedTypeId, libraryId]) => {
            if (!biblio) return;

            const rulesParams = {
                patron_category_id: categoryId,
                item_type_id: itemtypeId ?? constrainedTypeId,
                library_id: libraryId,
            };
            const key = buildRulesKey(rulesParams);
            if (lastRulesKey.value !== key) {
                lastRulesKey.value = key;
                data.invalidateCalculatedDue();
                data.fetchCirculationRules(rulesParams);
            }
        },
        { immediate: true, flush: "post" }
    );

    // Auto-fetch holidays whenever the pickup library changes.
    watch(
        () => draft.pickupLibraryId.value,
        libraryId => {
            if (libraryId === lastHolidaysLibrary.value) return;
            lastHolidaysLibrary.value = libraryId;

            const today = new Date();
            const oneYearLater = addMonths(today, 12);
            data.fetchHolidays(
                libraryId,
                formatYMD(today),
                formatYMD(oneYearLater)
            );
        },
        { immediate: true }
    );

    // Auto-set a sensible default pickup library when none is selected
    // yet. Order of preference:
    //  1. OPAC syspref override (when enabled and present in the list)
    //  2. The patron's home library
    //  3. The first bookable item's home library
    watch(
        [() => draft.bookingPatron.value, () => data.pickupLocations.value],
        ([patron, locations]) => {
            if (draft.pickupLibraryId.value) return;
            const list = Array.isArray(locations) ? locations : [];

            const enabled =
                opacDefaultBookingLibraryEnabled.value === true ||
                String(opacDefaultBookingLibraryEnabled.value) === "1";
            const def = opacDefaultBookingLibrary.value ?? "";
            if (enabled && def && list.some(l => idsEqual(l.library_id, def))) {
                draft.pickupLibraryId.value = def;
                return;
            }

            if (patron && list.length > 0) {
                const patronLib = patron.library_id;
                if (list.some(l => idsEqual(l.library_id, patronLib))) {
                    draft.pickupLibraryId.value = patronLib;
                    return;
                }
            }

            const items = Array.isArray(data.bookableItems.value)
                ? data.bookableItems.value
                : [];
            if (items.length > 0 && list.length > 0) {
                const homeLib = items[0]?.home_library_id;
                if (list.some(l => idsEqual(l.library_id, homeLib))) {
                    draft.pickupLibraryId.value = homeLib;
                }
            }
        },
        { immediate: true }
    );

    // Auto-derive item type from a single constrained option, or from
    // the selected item's type when an explicit selection has been made.
    watch(
        [
            availability.constrainedItemTypes,
            () => draft.bookingItemId.value,
            () => data.bookableItems.value,
        ],
        ([constrainedTypes, itemId, bookableItems]) => {
            if (
                !draft.bookingItemtypeId.value &&
                Array.isArray(constrainedTypes) &&
                constrainedTypes.length === 1
            ) {
                draft.bookingItemtypeId.value =
                    constrainedTypes[0].item_type_id;
                return;
            }

            if (!draft.bookingItemtypeId.value && itemId) {
                const item = (bookableItems || []).find(i =>
                    idsEqual(i.item_id, itemId)
                );
                if (item) {
                    draft.bookingItemtypeId.value =
                        item.effective_item_type_id ||
                        item.item_type_id ||
                        null;
                }
            }
        },
        { immediate: true }
    );

    return {
        configureExternalInputs,
    };
}

/**
 * Stable, explicit, order-preserving key builder to avoid JSON quirks
 * around insertion order across engines.
 *
 * @param {{ patron_category_id?: string|number, item_type_id?: string|number, library_id?: string }} params
 * @returns {string}
 */
function buildRulesKey(params) {
    return [
        ["pc", params.patron_category_id],
        ["it", params.item_type_id],
        ["lib", params.library_id],
    ]
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("|");
}
