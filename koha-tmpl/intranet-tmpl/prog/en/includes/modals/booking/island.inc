[% USE raw %]
[% USE Koha %]
[% USE Asset %]

<div id="booking-modal-mount">
    <booking-modal-island biblionumber="[% biblionumber | html %]" show-patron-select show-item-details-selects show-pickup-location-select date-range-constraint="issuelength_with_renewals"></booking-modal-island>
</div>
[% SET islands = Asset.js("js/vue/dist/islands.esm.js").match('(src="([^"]+)")').1 %]
 <script src="[% islands | $raw %]" type="module" nonce="[% Koha.CSPNonce | $raw %]">
</script>
<script type="module" nonce="[% Koha.CSPNonce | $raw %]">
    import { hydrate } from "[% islands | $raw %]";
    hydrate();

    const island = document.querySelector("booking-modal-island");
    const islandReady = (async () => {
        await customElements.whenDefined("booking-modal-island");
        return document.querySelector("booking-modal-island");
    })();

    const normalizeProps = (targetIsland, source) => {
        if (!targetIsland || !source) return;

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

        targetIsland.bookingId = bookingId;
        targetIsland.itemId = itemId;
        targetIsland.patronId = patronId;
        targetIsland.pickupLibraryId = pickupLibraryId;
        targetIsland.startDate = startDate;
        targetIsland.endDate = endDate;
        targetIsland.itemtypeId = itemtypeId;

        if (biblionumber) {
            targetIsland.biblionumber = biblionumber;
        }
    };

    const openModal = async props => {
        const targetIsland = await islandReady;
        if (!targetIsland) return;
        normalizeProps(targetIsland, props || {});
        targetIsland.open = true;
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
