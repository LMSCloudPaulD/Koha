use Modern::Perl;

return {
    bug_number  => "8838",
    description => "Add digest option for HOLD notice",
    up          => sub {
        my ($args) = @_;
        my ( $dbh, $out ) = @$args{qw(dbh out)};

        $dbh->do(q{
            INSERT INTO `letter` VALUES (NULL,'reserves','HOLDDGST','','Hold available for pickup (digest)',0,'Hold(s) available for pickup','You have one or more holds available for pickup:\r\n----\r\nTitle: [% hold.biblio.title %]\r\nAuthor: [% hold.biblio.author %]\r\nCopy: [% hold.item.copynumber %]\r\nLocation: [% hold.branch.branchname %]\r\nWaiting since: [% hold.waitingdate %]:\r\n[% hold.branch.branchaddress1 %]\r\n[% hold.branch.branchaddress2 %]\r\n[% hold.branch.branchaddress3 %]\r\n[% hold.branch.branchcity %] [% hold.branch.branchzip %]\r\n----','email','default','2023-08-29 18:42:15');
        });

        $dbh->do(q{
            INSERT INTO message_transports VALUES
            ( 4, "email", 1, "reserves", "HOLDDGST", "" ),
            ( 4, "sms", 1, "reserves", "HOLDDGST", "" ),
            ( 4, "phone", 1, "reserves", "HOLDDGST", "");
        });

        # Print useful stuff here
        # tables
        say $out "Added new table 'XXX'";
        say $out "Added column 'XXX.YYY'";

        # sysprefs
        say $out "Added new system preference 'XXX'";
        say $out "Updated system preference 'XXX'";
        say $out "Removed system preference 'XXX'";

        # permissions
        say $out "Added new permission 'XXX'";

        # letters
        say $out "Added new letter 'XXX' (TRANSPORT)";
    },
};