#!/usr/bin/perl

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

use C4::Members ();
use C4::Auth    qw( get_template_and_user );
use C4::Output  qw( output_html_with_http_headers );

use Koha::Biblios   ();
use Koha::Booking   ();
use Koha::Bookings  ();
use Koha::DateUtils qw(dt_from_string);
use Koha::Patrons   ();

use CGI         qw( -utf8 );
use Carp        qw( croak );

my $query = CGI->new;

my ( $template, $borrowernumber, $cookie ) = get_template_and_user(
    {
        template_name => 'opac-bookings.tt',
        query         => $query,
        type          => 'opac',
    }
);

my $patron = Koha::Patrons->find($borrowernumber);

my $op = $query->param('op') // 'list';
if ( $op eq 'list' ) {
    my $bookings = Koha::Bookings->search( { patron_id => $patron->borrowernumber } );

    my $biblio;
    my $biblio_id = $query->param('biblionumber');
    if ($biblio_id) {
        $biblio = Koha::Biblios->find($biblio_id);
    }

    $template->param(
        op       => 'list',
        biblio   => $biblio,
        BOOKINGS => $bookings,
    );
}

if ( $op eq 'cud-cancel' ) {
    my $booking_id = $query->param('booking_id');
    my $booking    = Koha::Bookings->find($booking_id);
    if ( !$booking ) {
        print $query->redirect('/cgi-bin/koha/errors/404.pl') or croak;
        exit;
    }

    if ( $booking->patron_id ne $patron->borrowernumber ) {
        print $query->redirect('/cgi-bin/koha/errors/403.pl') or croak;
        exit;
    }

    my $is_deleted = $booking->delete;
    if ( !$is_deleted ) {
        print $query->redirect('/cgi-bin/koha/errors/500.pl') or croak;
        exit;
    }

    my $referer = $query->referer;
    if ( $referer =~ /opac-user.pl/smx ) {
        print $query->redirect('/cgi-bin/koha/opac-user.pl?tab=opac-user-bookings') or croak;
        exit;
    }

    if ( $referer =~ /opac-bookings.pl/smx ) {
        print $query->redirect('/cgi-bin/koha/opac-bookings.pl') or croak;
        exit;
    }

    print $query->redirect('/cgi-bin/koha/opac-bookings.pl') or croak;
}

if ( $op eq 'cud-change_pickup_location' ) {
    my $booking_id          = $query->param('booking_id');
    my $new_pickup_location = $query->param('new_pickup_location');
    my $booking             = Koha::Bookings->find($booking_id);

    if ( !$booking ) {
        print $query->redirect('/cgi-bin/koha/errors/404.pl') or croak;
        exit;
    }

    if ( $booking->patron_id ne $patron->borrowernumber ) {
        print $query->redirect('/cgi-bin/koha/errors/403.pl') or croak;
        exit;
    }

    my $is_updated = $booking->update( { pickup_library_id => $new_pickup_location } );
    if ( !$is_updated ) {
        print $query->redirect('/cgi-bin/koha/errors/500.pl') or croak;
        exit;
    }

    my $referer = $query->referer;
    if ( $referer =~ /opac-user.pl/smx ) {
        print $query->redirect('/cgi-bin/koha/opac-user.pl?tab=opac-user-bookings') or croak;
        exit;
    }

    if ( $referer =~ /opac-bookings.pl/smx ) {
        print $query->redirect('/cgi-bin/koha/opac-bookings.pl') or croak;
        exit;
    }

    print $query->redirect('/cgi-bin/koha/opac-bookings.pl') or croak;
}

$template->param(
    bookingsview => 1,
);

output_html_with_http_headers $query, $cookie, $template->output, undef, { force_no_caching => 1 };
