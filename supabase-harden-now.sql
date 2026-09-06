-- ═══════════════════════════════════════════════════════════════════════════
-- HARDEN NOW — safe to run today, on the app as it is built
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this one. It is idempotent: run it as many times as you like.
--
-- What it does NOT do: it does not stop someone who has the anon key from reading
-- your data. That is not fixable while every phone shares one key — it needs per-staff
-- Supabase Auth (see supabase-lockdown.sql, which must NOT be run until then).
--
-- What it DOES do, all of which is worth having today:
--   1. Turns RLS on for every table, so access is explicit rather than accidental.
--   2. Takes DELETE away from the app's key. Nothing in the app hard-deletes a sale,
--      an expense or a punch — it flags them. So removing DELETE costs nothing and
--      means a stray script, or anyone who finds the key, cannot wipe your books.
--   3. Takes DELETE and UPDATE away on dispatches, which are invoice records: a
--      correction is a new row, never an edit of the old one.
--   4. Blocks the app's key from every OTHER table in the database — including the
--      older project's tables sharing this database.

-- ── 1. RLS on, with an explicit policy per table ──────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'requests','dispatches','cm_sales','stock','special_orders','punches',
    'notifications','expenses','damage','daybook','staff_accounts','cm_records'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists app_read on public.%I', t);
      execute format('drop policy if exists app_write on public.%I', t);
      execute format('drop policy if exists app_update on public.%I', t);
      execute format('create policy app_read   on public.%I for select to anon using (true)', t);
      execute format('create policy app_write  on public.%I for insert to anon with check (true)', t);
      -- dispatches are the invoice record: written once, never edited.
      if t <> 'dispatches' then
        execute format('create policy app_update on public.%I for update to anon using (true)', t);
      end if;
    end if;
  end loop;
end $$;

-- ── 2. No DELETE for the app's key, anywhere ──────────────────────────────
-- The app soft-deletes (deleted=true / active=false), so it never needs this right.
-- Without it, one stray request cannot empty a table.
do $$
declare t text;
begin
  foreach t in array array[
    'requests','dispatches','cm_sales','stock','special_orders','punches',
    'notifications','expenses','damage','daybook','staff_accounts','cm_records'
  ]
  loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format('revoke delete on public.%I from anon', t);
    end if;
  end loop;
end $$;

-- ── 3. Nothing else in this database is reachable by the app's key ────────
-- This database is shared with an older project. Its tables are none of this app's
-- business, and this app's key should not open them.
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
      and table_name <> all (array[
        'requests','dispatches','cm_sales','stock','special_orders','punches',
        'notifications','expenses','damage','daybook','staff_accounts','cm_records'
      ])
  loop
    execute format('revoke all on public.%I from anon', r.table_name);
  end loop;
end $$;

-- ── 4. Check what you ended up with ───────────────────────────────────────
select tablename,
       rowsecurity as rls_on,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as policies
from pg_tables t
where schemaname = 'public'
order by tablename;
