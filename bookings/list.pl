#!/usr/bin/perl

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

use CGI qw ( -utf8 );

use C4::Output qw( output_html_with_http_headers );
use C4::Auth   qw( get_template_and_user );

use Koha::AdditionalFields;

my $input = CGI->new;
my ( $template, $borrowernumber, $cookie, $flags ) = get_template_and_user(
    {
        template_name => "bookings/list.tt",
        query         => $input,
        type          => "intranet",
        flagsrequired => { circulate => 'manage_bookings' },
    }
);

my $biblionumber = $input->param('biblionumber');
my $biblio       = Koha::Biblios->find($biblionumber);
my $bookings     = Koha::Bookings->search( { biblio_id => $biblio->biblionumber } );

use Data::Dumper;
my $test = Koha::AdditionalFields->search( { tablename => 'bookings' } )->as_list;
foreach (@$test) {
    warn Dumper $_->unblessed;
}

$template->param(
    biblionumber                => $biblionumber,
    biblio                      => $biblio,
    additional_fields           => Koha::AdditionalFields->search( { tablename => 'bookings' } ),
    additional_field_values     => { map { $_->booking_id => $_->get_additional_field_values_for_template } $bookings->as_list },
    bookingsview                => 1,
);

output_html_with_http_headers $input, $cookie, $template->output;
