-- ═══════════════════════════════════════════════════════════════════════════
-- GOOGLE SIGN-IN — the one column it needs
-- ═══════════════════════════════════════════════════════════════════════════
-- Safe to run more than once. Nothing is dropped, nothing is overwritten, no existing
-- row is touched. Paste the whole file into Supabase → SQL Editor → Run.
--
-- Google sign-in works by matching the email Google proves against an email an OWNER put
-- on a staff row. That is the whole access rule, and it is why there is only one column
-- here: the app must never be able to grant its own access.

alter table staff_accounts add column if not exists email text;

-- Lower-cased on the way in, because Google returns the address in whatever case the
-- person typed it years ago, and Tanmay@ must match tanmay@ or the owner is locked out of
-- their own shop with a message that makes no sense.
update staff_accounts set email = lower(trim(email)) where email is not null and email <> lower(trim(email));

-- One email belongs to one person. A duplicate would make the role that opens ambiguous,
-- which on this app means it might open the owner's profit figures.
create unique index if not exists idx_staff_accounts_email
  on staff_accounts (email, role) where email is not null;

-- Optional, and worth doing once the shop is calm: set the owner's email here instead of
-- in the app, so the very first Google sign-in works before anybody has opened the Backup
-- screen. Replace the address, then remove the two dashes.
-- update staff_accounts set email = 'you@gmail.com' where id = '8767569788:owner';

-- ⚠ STILL OUTSTANDING, and more important than this file: supabase-harden-now.sql.
-- Until those rules are on, the anon key in the app can read and write every table, and
-- Google sign-in only decides which SCREEN opens — not what the data lets you touch. A
-- login that gates the interface over an open database is a locked door in a glass wall.
