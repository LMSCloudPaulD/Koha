[% USE Koha %]

<div id="booking-modal-mount">
    <booking-modal-island
        biblionumber="[% biblionumber | html %]"
        show-patron-select
        show-item-details-selects
        show-pickup-location-select
        date-range-constraint="[% (Koha.Preference('BookingDateRangeConstraint') || 'issuelength_with_renewals') | html %]" [%# FIXME: issuelength_with_renewals needs to be the db default, don't constrain needs a value %]
    ></booking-modal-island>
</div>
[% SET islands = Asset.js("js/vue/dist/islands.esm.js").match('(src="([^"]+)")').1 %] <script src="[% islands %]" type="module"></script>
<script type="module">
    import { hydrate } from "[% islands %]";
    hydrate();

    const island = document.querySelector("booking-modal-island");

    const parseJson = value => {
        if (!value) return [];
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn("Failed to parse booking modal payload", error);
            return [];
        }
    };

    const normalizeProps = source => {
        if (!island || !source) return;

        const bookingId = source.booking ?? source.bookingId ?? null;
        const itemId = source.itemnumber ?? source.itemId ?? null;
        const patronId = source.patron ?? source.patronId ?? null;
        const pickupLibraryId =
            source.pickup_library ?? source.pickupLibraryId ?? null;
        const startDate = source.start_date ?? source.startDate ?? null;
        const endDate = source.end_date ?? source.endDate ?? null;
        const itemtypeId =
            source.item_type_id ?? source.itemtypeId ?? source.itemTypeId ?? null;
        const biblionumber =
            source.biblionumber ?? source.biblio_id ?? source.biblioId;

        island.bookingId = bookingId;
        island.itemId = itemId;
        island.patronId = patronId;
        island.pickupLibraryId = pickupLibraryId;
        island.startDate = startDate;
        island.endDate = endDate;
        island.itemtypeId = itemtypeId;
        island.selectedDateRange = startDate
            ? [startDate, endDate || startDate]
            : [];

        const extendedAttributes =
            source.extendedAttributes ?? source.extended_attributes ?? [];
        island.extendedAttributes = Array.isArray(extendedAttributes)
            ? extendedAttributes
            : parseJson(extendedAttributes);

        if (biblionumber) {
            island.biblionumber = biblionumber;
        }
    };

    const openModal = props => {
        if (!island) return;
        normalizeProps(props || {});
        island.open = true;
    };

    if (island) {
        island.addEventListener("close", () => {
            island.open = false;
        });
        /* This might need to be optimised if we ever
         * run into noticeable lag on click events. */
        document.addEventListener(
            "click",
            e => {
                const trigger = e.target.closest("[data-booking-modal]");
                if (!trigger) return;
                openModal(trigger.dataset);
            },
            { passive: true }
        );

        if (typeof window.openBookingModal !== "function") {
            window.openBookingModal = openModal;
        }
    }
</script>
