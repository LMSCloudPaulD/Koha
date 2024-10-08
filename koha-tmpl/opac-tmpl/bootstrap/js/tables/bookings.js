/// <reference types="jquery" />

function initBookingsTable() {
    return $("#opac-user-bookings-table").dataTable(
        $.extend(true, {}, dataTablesDefaults, {
            sorting: [
                [
                    $("#opac-user-bookings-table").find("th.psort").index(),
                    "asc",
                ],
            ],
            dom: '<"top"<"table_entries"><"table_controls"fB>>t',
            columnDefs: [
                {
                    targets: ["nosort"],
                    sortable: false,
                    searchable: false,
                },
                {
                    type: "anti-the",
                    targets: ["anti-the"],
                },
                {
                    visible: false,
                    targets: ["hidden"],
                },
                {
                    className: "dtr-control",
                    orderable: false,
                    targets: -1,
                },
            ],
            language: {
                search: "_INPUT_",
                searchPlaceholder: __("Search"),
            },
            autoWidth: false,
            responsive: {
                details: {
                    type: "column",
                    target: -1,
                },
            },
            buttons: [
                "clearFilter",
                "copy",
                {
                    extend: "print",
                    exportOptions: {
                        columns: ":not(.noExport)",
                    },
                },
                {
                    extend: "csv",
                    exportOptions: {
                        columns: ":not(.noExport)",
                    },
                },
            ],
            ajax: {
                url: `/api/v1/public/bookings?_per_page=-1`,
                dataSrc: "",
                cache: true,
                headers: {
                    "x-koha-embed": "patron,biblio,item,pickup_library",
                },
            },
            columns: [
                {
                    data: "status",
                    title: __("Status"),
                    render: function (data) {
                        return `<span class="badge rounded-pill text-bg-secondary">${data}</span>`;
                    },
                },
                {
                    data: "biblio.title",
                    title: __("Title"),
                    render: function (_, __, row) {
                        return $biblio_to_html(row.biblio, {
                            link: "bookings",
                        });
                    },
                },
                {
                    data: "creation_date",
                    title: __("Placed on"),
                    render: function (data, _, row) {
                        return data ? $date(row.creation_date) : "&ndash;";
                    },
                },
                {
                    data: "pickup_library.name",
                    title: __("Pickup location"),
                    render: function (data) {
                        return data ?? "&ndash;";
                    },
                },
                {
                    data: "start_date",
                    title: __("Start date"),
                    render: function (_, __, row) {
                        return $date(row.start_date);
                    },
                },
                {
                    data: "end_date",
                    title: __("End date"),
                    render: function (_, __, row) {
                        return $date(row.end_date);
                    },
                },
                {
                    data: "item.item_type_id",
                    title: __("Item type"),
                    defaultContent: "&ndash;",
                    render: function (data) {
                        return data;
                    },
                },
                {
                    data: "item.external_id",
                    title: __("Barcode"),
                    defaultContent: __("Any item"),
                    render: function (_, __, row) {
                        return row.item ? row.item.external_id : null;
                    },
                },
                {
                    data: "item.home_library_id",
                    title: __("Provided by"),
                    defaultContent: "&ndash;",
                    render: function (data) {
                        return data;
                    },
                },
                {
                    title: __("Modify"),
                    searchable: false,
                    orderable: false,
                    render: function (_, ___, row) {
                        return `
                            <div class="btn-group" role="group" aria-label="actions">
                                <button type="button" class="btn btn-sm btn-link" 
                                    data-booking-id="${row.booking_id}"
                                    data-bs-toggle="modal"
                                    data-bs-target="#booking-change-pickup-location">
                                    <i class="fa fa-pencil-alt"></i>&nbsp;${__(
                                        "Change"
                                    )}
                                </button>
                                <button type="button" class="btn btn-sm btn-link" 
                                    data-booking-id="${row.booking_id}"
                                    data-bs-toggle="modal"
                                    data-bs-target="#booking-cancel">
                                    <i class="fa fa-times"></i>&nbsp;${__(
                                        "Cancel"
                                    )}
                                </button>
                            </div>
                    `;
                    },
                },
                {
                    defaultContent: "",
                },
            ],
        })
    );
}
