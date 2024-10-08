[% USE Branches %]

<div class="modal" id="booking-[% action %]" tabindex="-1" aria-labelledby="booking-[% action %]-label" aria-hidden="true">
    <div class="modal-dialog">
        <form id="booking-form-[% action %]">
            [% SWITCH action %]
                [% CASE 'add' %]
                [% CASE %]
                    [% INCLUDE 'csrf-token.inc' %]
                    <input type="hidden" name="op" value="cud-[% action.replace('-', '_') %]">
                    <input type="hidden" name="booking_id" value="[% BOOKING.booking_id %]" />
            [% END %]
            <div class="modal-content">
                <div class="modal-header">
                    <h1 class="modal-title" id="booking-[% action %]-label">
                        [% SWITCH action %]
                            [% CASE 'change-pickup-location' %]
                                Change pickup location for booking of <em>[% INCLUDE 'biblio-title.inc' biblio = BOOKING.item.biblio %]</em>
                            [% CASE 'cancel' %]
                                Cancel booking of <em>[% INCLUDE 'biblio-title.inc' biblio = BOOKING.item.biblio %]</em>
                            [% CASE 'add' %]
                                Place a booking
                            [% CASE %]
                        [% END %]
                    </h1>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    [% SWITCH action %]
                        [% CASE 'change-pickup-location' %]
                            <div class="form-group">
                                <label for="booking-new-pickup-location">New pickup location:</label>
                                <select name="new_pickup_location" id="booking-new-pickup-location-[% BOOKING.booking_id %]" class="form-select">
                                    [% PROCESS options_for_libraries 
                                        libraries = Branches.pickup_locations({ 
                                            search_params => { 
                                                biblio => BOOKING.item.biblio, 
                                                patron => BOOKING.patron_id 
                                            }, 
                                            selected => BOOKING.pickup_library_id 
                                        }) 
                                    %]
                                </select>
                            </div>
                        [% CASE 'cancel' %]
                            <span>Are you sure you want to cancel your booking of <em>[% INCLUDE 'biblio-title.inc' biblio = BOOKING.item.biblio %]</em>?</span>
                        [% CASE 'add' %]
                            <fieldset class="brief">
                                <div id="biblio-id-wrapper">
                                    <input type="hidden" name="biblio_id" id="booking-biblio-id" value="[% biblio.biblionumber %]">
                                    [% IF biblio.biblionumber %]
                                        <legend><span>For: </span>[% INCLUDE 'biblio-title.inc' %]</legend>
                                    [% END %]
                                </div>
                                <div id="pickup-library-id-wrapper">
                                    <label class="required" for="booking-pickup-library-id">Pickup at:</label>
                                    <select name="pickup_library_id" id="booking-pickup-library-id" data-data-source="libraries" required></select>
                                    <span class="required">Required</span>
                                </div>
                                <div id="item-id-wrapper">
                                    <label for="booking-item-id" data-source="items">Item: </label>
                                    <select name="item_id" id="booking-item-id" data-data-source="items">
                                        <option value="0">Any item</option>
                                    </select>
                                </div>
                                <div id="period-wrapper">
                                    <input type="hidden" name="start_date" id="booking-start-date">
                                    <input type="hidden" name="end_date" id="booking-end-date">
                                    <div id="period-fields">
                                        <label class="required" for="booking-period">Booking dates: </label>
                                        <input 
                                            type="text" 
                                            id="booking-period" 
                                            class="flatpickr" 
                                            data-flatpickr-futuredate="true" 
                                            data-flatpickr-disable-shortcuts="true" 
                                            required 
                                            autocomplete="off"
                                        >
                                        <span class="required">Required</span>
                                    </div>
                                    <div class="hint">Select the booking start and end dates</div>
                                </div>
                            </fieldset>
                            <input type="hidden" name="patron_id" value="[% logged_in_user.borrowernumber %]" />
                        [% CASE %]
                    [% END %]
                </div>
                <div class="modal-footer">
                    <button type="submit" name="[% action.replace('-', '_') %]" value="1" class="btn btn-primary">
                        <i class="fa fa-check" aria-hidden="true"></i>&nbsp;
                        [% SWITCH action %]
                            [% CASE 'cancel' %]
                                <span>Confirm</span>
                            [% CASE %]
                                <span>Save</span>
                        [% END %]
                    </button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        <i class="fa fa-times" aria-hidden="true"></i>&nbsp;Cancel
                    </button>
                </div>
            </div> <!-- /.modal-content -->
        </form>
    </div> <!-- /.modal-dialog -->
</div> <!-- /.modal -->
