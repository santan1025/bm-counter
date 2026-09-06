-- ═══════════════════════════════════════════════════════════════════════════
-- LOCKDOWN — ⚠ DO NOT RUN YET. IT WILL STOP THE APP DEAD.
-- ═══════════════════════════════════════════════════════════════════════════
-- Every policy below grants to `authenticated`. The app as deployed today signs in
-- nobody with Supabase Auth — it holds one anon key shared by all phones, and staff
-- PINs are checked on the device. So under these rules every phone becomes an
-- unauthenticated caller with access to nothing: no sales, no requests, no dispatches,
-- no staff list. Tills stop, the kitchen board empties, and no PIN works.
--
-- Two things must happen before this file is correct to run:
--   1. Each staff member gets a real Supabase Auth user, with shop_id, role and phone
--      in app_metadata (the login screen signs in against Auth instead of a local PIN).
--   2. The app is redeployed to use that session rather than the shared anon key.
--
-- That is roughly a day's work and it is the only thing that makes shop isolation real.
-- Until then, run supabase-harden-now.sql — it takes away destructive rights and shuts
-- the app's key out of the rest of the database, which is what CAN be done today.
--
-- Idempotent: every policy is dropped before it is created, so a partial earlier run
-- (the "policy already exists" error) no longer blocks it.
-- Table names match the app's real schema: cm_sales, not sales.

-- ── tables ────────────────────────────────────────────────────────────────
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
      -- Clear the permissive anon policies from supabase-harden-now.sql.
      execute format('drop policy if exists app_read   on public.%I', t);
      execute format('drop policy if exists app_write  on public.%I', t);
      execute format('drop policy if exists app_update on public.%I', t);
    end if;
  end loop;
end $$;

-- ── who am I ──────────────────────────────────────────────────────────────
create or replace function my_shop() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'shop_id', '')
$$;

create or replace function my_role() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function my_phone() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'phone', '')
$$;

-- The kitchen cannot bake for a shop whose stock it may not read.
create or replace function sees_all() returns boolean language sql stable as $$
  select my_role() in ('owner','kitchen_manager','chef')
$$;

-- ── sales ─────────────────────────────────────────────────────────────────
drop policy if exists sales_read  on cm_sales;
drop policy if exists sales_write on cm_sales;
drop policy if exists sales_upd   on cm_sales;
create policy sales_read  on cm_sales for select to authenticated using (shop_id = my_shop() or sees_all());
create policy sales_write on cm_sales for insert to authenticated with check (shop_id = my_shop());
create policy sales_upd   on cm_sales for update to authenticated using (shop_id = my_shop() or my_role() = 'owner');

-- ── stock ─────────────────────────────────────────────────────────────────
drop policy if exists stock_read  on stock;
drop policy if exists stock_write on stock;
create policy stock_read  on stock for select to authenticated using (shop_id = my_shop() or sees_all());
create policy stock_write on stock for all    to authenticated using (shop_id = my_shop() or my_role() in ('kitchen_manager','owner'));

-- ── requests: the shop that raised it, and the kitchen that fills it ─────
drop policy if exists req_read on requests;
drop policy if exists req_ins  on requests;
drop policy if exists req_upd  on requests;
create policy req_read on requests for select to authenticated using (shop_id = my_shop() or sees_all());
create policy req_ins  on requests for insert to authenticated with check (shop_id = my_shop());
create policy req_upd  on requests for update to authenticated using (my_role() in ('kitchen_manager','owner') or shop_id = my_shop());

-- ── dispatches are the invoice record: written once, never edited ─────────
drop policy if exists disp_read on dispatches;
drop policy if exists disp_ins  on dispatches;
create policy disp_read on dispatches for select to authenticated using (shop_id = my_shop() or sees_all());
create policy disp_ins  on dispatches for insert to authenticated with check (my_role() in ('kitchen_manager','owner'));

-- ── special orders ────────────────────────────────────────────────────────
drop policy if exists spec_read on special_orders;
drop policy if exists spec_all  on special_orders;
create policy spec_read on special_orders for select to authenticated using (shop_id = my_shop() or sees_all());
create policy spec_all  on special_orders for all    to authenticated using (shop_id = my_shop() or my_role() in ('owner','kitchen_manager'));

-- ── attendance: your own row, or the owner's view of everyone ────────────
-- Staff must never see each other's hours, and nobody edits their own punch times.
drop policy if exists punch_read on punches;
drop policy if exists punch_ins  on punches;
drop policy if exists punch_upd  on punches;
create policy punch_read on punches for select to authenticated using (staff_phone = my_phone() or my_role() = 'owner');
create policy punch_ins  on punches for insert to authenticated with check (staff_phone = my_phone());
create policy punch_upd  on punches for update to authenticated using (my_role() = 'owner');

-- ── notifications ─────────────────────────────────────────────────────────
drop policy if exists notif_read on notifications;
drop policy if exists notif_ins  on notifications;
drop policy if exists notif_upd  on notifications;
create policy notif_read on notifications for select to authenticated
  using (for_role in ('all', my_role()) and (shop_id is null or shop_id = my_shop() or sees_all()));
create policy notif_ins  on notifications for insert to authenticated with check (true);
create policy notif_upd  on notifications for update to authenticated using (true);

-- ── money out: expenses, damage, the daybook ─────────────────────────────
drop policy if exists exp_read on expenses;
drop policy if exists exp_all  on expenses;
create policy exp_read on expenses for select to authenticated using (shop_id = my_shop() or sees_all());
create policy exp_all  on expenses for all    to authenticated using (shop_id = my_shop() or my_role() = 'owner');

drop policy if exists dmg_read on damage;
drop policy if exists dmg_all  on damage;
create policy dmg_read on damage for select to authenticated using (shop_id = my_shop() or sees_all());
create policy dmg_all  on damage for all    to authenticated using (shop_id = my_shop() or my_role() = 'owner');

drop policy if exists day_read on daybook;
drop policy if exists day_all  on daybook;
create policy day_read on daybook for select to authenticated using (shop_id = my_shop() or sees_all());
create policy day_all  on daybook for all    to authenticated using (shop_id = my_shop() or my_role() = 'owner');

-- ── the staff roster ──────────────────────────────────────────────────────
-- Everyone signed in reads it (the login screen needs it); only the owner changes it.
drop policy if exists staff_read on staff_accounts;
drop policy if exists staff_own  on staff_accounts;
drop policy if exists staff_mgmt on staff_accounts;
create policy staff_read on staff_accounts for select to authenticated using (true);
create policy staff_own  on staff_accounts for update to authenticated using (phone = my_phone());
create policy staff_mgmt on staff_accounts for all    to authenticated using (my_role() = 'owner');

-- ── the counter app's own record store ───────────────────────────────────
drop policy if exists rec_read on cm_records;
drop policy if exists rec_all  on cm_records;
create policy rec_read on cm_records for select to authenticated using (shop = my_shop() or sees_all());
create policy rec_all  on cm_records for all    to authenticated using (shop = my_shop() or my_role() = 'owner');

-- Salary rates are owner-only and therefore do not belong in any table the app reads.
-- When that screen is built it goes behind an edge function, not a policy.
