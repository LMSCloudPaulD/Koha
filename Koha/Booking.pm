package Koha::Booking;

# Copyright PTFS Europe 2021
#
# This file is part of Koha.
#
# Koha is free software; you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3 of the License, or
# (at your option) any later version.
#
# Koha is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Koha; if not, see <http://www.gnu.org/licenses>.

use Modern::Perl;

use Koha::Exceptions::Booking;
use Koha::DateUtils qw( dt_from_string );
use Koha::Items;
use Koha::Patrons;
use Koha::Libraries;

use C4::Letters;

use List::Util qw( any );

use base qw(Koha::Object);

=head1 NAME

Koha::Booking - Koha Booking object class

=head1 API

=head2 Class methods

=head3 biblio

Returns the related Koha::Biblio object for this booking

=cut

sub biblio {
    my ($self) = @_;

    my $biblio_rs = $self->_result->biblio;
    return Koha::Biblio->_new_from_dbic($biblio_rs);
}

=head3 patron

Returns the related Koha::Patron object for this booking

=cut

sub patron {
    my ($self) = @_;

    my $patron_rs = $self->_result->patron;
    return Koha::Patron->_new_from_dbic($patron_rs);
}

=head3 pickup_library

Returns the related Koha::Library object for this booking

=cut

sub pickup_library {
    my ($self) = @_;

    my $pickup_library_rs = $self->_result->pickup_library;
    return Koha::Library->_new_from_dbic($pickup_library_rs);
}

=head3 item

Returns the related Koha::Item object for this Booking

=cut

sub item {
    my ($self) = @_;

    my $item_rs = $self->_result->item;
    return unless $item_rs;
    return Koha::Item->_new_from_dbic($item_rs);
}

=head3 status

Returns the set or computed status

'Cancelled' and 'completed' are final states. We compare the start and end dates on 'new'
to compute the actual state that the booking is currently in.

=cut

sub status {
    my ($self) = @_;

    my $status = $self->_result->status;
    return $status if any { $status eq $_ } qw(cancelled completed);

    my $today      = dt_from_string;
    my $start_date = dt_from_string( $self->start_date );
    my $end_date   = dt_from_string( $self->end_date );
    return 'expired' if $end_date < $today;
    return 'pending' if $start_date > $today;
    return 'active'  if $start_date <= $today and $end_date >= $today;

    return $status;
}

=head3 store

Booking specific store method to catch booking clashes and ensure we have an item assigned

We assume that if an item is passed, it's bookability has already been checked. This is to allow
overrides in the future.

=cut

sub store {
    my ($self) = @_;

    $self->_result->result_source->schema->txn_do(
        sub {
            if ( $self->item_id ) {
                Koha::Exceptions::Object::FKConstraint->throw(
                    broken_fk => 'item_id',
                    value     => $self->item_id,
                ) unless ( $self->item );

                $self->biblio_id( $self->item->biblionumber )
                    unless $self->biblio_id;

                Koha::Exceptions::Object::FKConstraint->throw()
                    unless ( $self->biblio_id == $self->item->biblionumber );
            }

            Koha::Exceptions::Object::FKConstraint->throw(
                broken_fk => 'biblio_id',
                value     => $self->biblio_id,
            ) unless ( $self->biblio );

            # Throw exception for item level booking clash
            Koha::Exceptions::Booking::Clash->throw()
                if $self->item_id && !$self->item->check_booking(
                {
                    start_date => $self->start_date,
                    end_date   => $self->end_date,
                    booking_id => $self->in_storage ? $self->booking_id : undef
                }
                );

            # Throw exception for biblio level booking clash
            Koha::Exceptions::Booking::Clash->throw()
                if !$self->biblio->check_booking(
                {
                    start_date => $self->start_date,
                    end_date   => $self->end_date,
                    booking_id => $self->in_storage ? $self->booking_id : undef
                }
                );

            # FIXME: We should be able to combine the above two functions into one

            # Assign item at booking time
            if ( !$self->item_id ) {
                $self->_assign_item_for_booking;
            }

            $self = $self->SUPER::store;
        }
    );

    return $self;
}

=head3 _assign_item_for_booking

  $self->_assign_item_for_booking;

Used internally in Koha::Booking->store to ensure we have an item assigned for the booking.

=cut

sub _assign_item_for_booking {
    my ($self) = @_;

    my $biblio = $self->biblio;

    my $start_date = dt_from_string( $self->start_date );
    my $end_date   = dt_from_string( $self->end_date );

    my $dtf = Koha::Database->new->schema->storage->datetime_parser;

    my $existing_bookings = $biblio->bookings(
        [
            start_date => {
                '-between' => [
                    $dtf->format_datetime($start_date),
                    $dtf->format_datetime($end_date)
                ]
            },
            end_date => {
                '-between' => [
                    $dtf->format_datetime($start_date),
                    $dtf->format_datetime($end_date)
                ]
            },
            {
                start_date => { '<' => $dtf->format_datetime($start_date) },
                end_date   => { '>' => $dtf->format_datetime($end_date) }
            }
        ]
    );

    my $checkouts =
        $biblio->current_checkouts->search( { date_due => { '>=' => $dtf->format_datetime($start_date) } } );

    my $bookable_items = $biblio->bookable_items->search(
        {
            itemnumber => [
                '-and' => { '-not_in' => $existing_bookings->_resultset->get_column('item_id')->as_query },
                { '-not_in' => $checkouts->_resultset->get_column('itemnumber')->as_query }
            ]
        },
        { rows => 1 }
    );

    my $itemnumber = $bookable_items->single->itemnumber;
    return $self->item_id($itemnumber);
}

=head3 get_items_that_can_fill

    my $items = $bookings->get_items_that_can_fill();

Return the list of items that can fulfill this booking.

Items that are not:

  in transit
  lost
  withdrawn
  not for loan
  not already booked

=cut

sub get_items_that_can_fill {
    my ($self) = @_;
    return;
}

=head3 is_accessible

    if ( $booking->is_accessible({ user => $logged_in_user }) ) { ... }

This overloaded method validates whether the current I<Koha::Booking> object can be accessed
by the logged in user.

Returns 0 if the I<user> parameter is missing.

=cut

sub is_accessible {
    my ( $self, $params ) = @_;

    if ( !defined $params->{'user'} ) {
        return 0;
    }

    if ( !$params->{'public'} ) {
        return 1;
    }

    my $consumer = $params->{'user'};
    return $self->patron_id eq $consumer->borrowernumber;
}

=head3 public_read_list

This method returns the list of publicly readable database fields for both API and UI output purposes

=cut

sub public_read_list {
    return [
        'booking_id',        'patron_id',  'biblio_id', 'item_id',
        'pickup_library_id', 'start_date', 'end_date',  'status',
        'creation_date',
    ];
}

=head3 unredact_list

This method returns the list of database fields that should be visible, even for restricted users,
for both API and UI output purposes

=cut

sub unredact_list {
    return [
        'booking_id', 'biblio_id', 'item_id',
        'start_date', 'end_date',  'status',
        'creation_date',
    ];
}

=head3 to_api_mapping

This method returns the mapping for representing a Koha::Booking object
on the API.

=cut

sub to_api_mapping {
    return {};
}

=head3 delete

  my $deleted = $booking->delete();

=cut

sub delete {
    my ($self) = @_;

    my $patron         = $self->patron;
    my $pickup_library = $self->pickup_library;

    my $letter = C4::Letters::GetPreparedLetter(
        module                 => 'bookings',
        letter_code            => 'BOOKING_CANCELLATION',
        message_transport_type => 'email',
        branchcode             => $pickup_library->branchcode,
        lang                   => $patron->lang,
        objects                => { booking => $self }
    );

    if ($letter) {
        C4::Letters::EnqueueLetter(
            {
                letter                 => $letter,
                borrowernumber         => $patron->borrowernumber,
                message_transport_type => 'email',
            }
        );
    }

    my $deleted = $self->SUPER::delete($self);
    return $deleted;
}

=head2 Internal methods

=head3 _type

=cut

sub _type {
    return 'Booking';
}

=head1 AUTHORS

Martin Renvoize <martin.renvoize@ptfs-europe.com>

=cut

1;
