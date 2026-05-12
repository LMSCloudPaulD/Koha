-- DO NOT PUSH: dev seed for the Bug 41129 booking modal manual test plan.
--
-- Run via:
--     koha-mysql kohadev < bug_41129_seed.sql
--
-- Adjust the branchcode ('CPL') and itemtype ('BK') below if your
-- ktd sample data uses different codes. The statements are
-- idempotent: ON DUPLICATE KEY UPDATE on rules/sysprefs and a
-- NOT EXISTS guard on the holiday insert, so re-running is safe.

-- 1. Mark item type BK as bookable. The test plan's "Bookable
-- inventory" section relies on at least one itemtype carrying the
-- bookable flag; any bookable itemtype works.
UPDATE itemtypes
SET    bookable = 1
WHERE  itemtype = 'BK';

-- 2. Circulation rules at the wildcard scope (branchcode /
-- categorycode / itemtype all NULL) so any patron + branch +
-- itemtype combination inherits the rule values used by the
-- manual test scenarios.
--
--   bookings_lead_period  = 2  (steps 18, 25 and the lead-period
--                               hover-feedback messaging)
--   bookings_trail_period = 2  (step 18)
--   issuelength           = 7  (drives maxPeriod for step 19)
--   renewalsallowed       = 2  (extends maxPeriod under
--                               issuelength_with_renewals)
--   renewalperiod         = 7
INSERT INTO circulation_rules
    (branchcode, categorycode, itemtype, rule_name, rule_value)
VALUES
    (NULL, NULL, NULL, 'bookings_lead_period',  '2'),
    (NULL, NULL, NULL, 'bookings_trail_period', '2'),
    (NULL, NULL, NULL, 'issuelength',           '7'),
    (NULL, NULL, NULL, 'renewalsallowed',       '2'),
    (NULL, NULL, NULL, 'renewalperiod',         '7')
ON DUPLICATE KEY UPDATE rule_value = VALUES(rule_value);

-- 3. One closed day at CPL ten days out, so the calendar has a
-- holiday inside its initial visible range (step 15 + the
-- "library is closed on this date" hover message).
INSERT INTO special_holidays
    (branchcode, day, month, year, isexception, title, description)
SELECT 'CPL',
       DAY(DATE_ADD(CURDATE(),   INTERVAL 10 DAY)),
       MONTH(DATE_ADD(CURDATE(), INTERVAL 10 DAY)),
       YEAR(DATE_ADD(CURDATE(),  INTERVAL 10 DAY)),
       0,
       'Bug 41129 test closed day',
       'Bug 41129 test closed day'
WHERE NOT EXISTS (
    SELECT 1
    FROM   special_holidays
    WHERE  branchcode = 'CPL'
      AND  day   = DAY(DATE_ADD(CURDATE(),   INTERVAL 10 DAY))
      AND  month = MONTH(DATE_ADD(CURDATE(), INTERVAL 10 DAY))
      AND  year  = YEAR(DATE_ADD(CURDATE(),  INTERVAL 10 DAY))
);
