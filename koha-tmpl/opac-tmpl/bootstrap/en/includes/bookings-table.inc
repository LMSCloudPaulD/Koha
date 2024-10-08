[% PROCESS 'i18n.inc' %]

[% IF ( filter_by_active ) %]
    [% SET BOOKINGS = BOOKINGS.filter_by_active %]
[% END %]


<table id="opac-user-bookings-table" class="table table-bordered table-striped">
    <caption>Bookings <span class="count">([% BOOKINGS.count | html %] total)</span></caption>
    <thead>
        <tr>
            <th class="psort">Status</th>
            <th class="all anti-the">Title</th>
            <th>Placed on</th>
            <th>Pickup location</th>
            <th>Start date</th>
            <th>End date</th>
            <th>Item type</th>
            <th>Barcode</th>
            <th>Provided by</th>
            <th class="nosort noExport">Modify</th>
            <th></th>
    </thead>
    <tbody></tbody>
</table>
