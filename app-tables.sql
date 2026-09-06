-- ═════════════════════════════════════════════════════════════════
-- TABLES THIS APP NEEDS OF ITS OWN — run once, Supabase → SQL Editor
-- ═════════════════════════════════════════════════════════════════
-- This project is shared with the earlier Next.js app (bm-multishop). That app owns
-- shops, staff, products, sales, credit_accounts, cash_box_daily and cm_records, all keyed
-- by uuid and wired together with foreign keys.
--
-- This app keys everything by readable text ids — 'S1', '8767569788:counter',
-- 'req-S1-1724…' — because a phone with no signal has to invent an id that will not collide
-- when it reconnects. The two schemes cannot share a table:
--
--   • staff.id  is uuid            → our roster rows were rejected as invalid uuid syntax
--   • sales.shop_id is uuid NOT NULL with a foreign key to shops(id), and subtotal and
--     payment_mode are NOT NULL     → every till receipt this app pushed was rejected too
--
-- Both failures were silent: writes queued, retried, and the screens said "Connected".
-- So this app gets its own two tables and never touches the other app's.
--
-- Safe to re-run. Nothing here alters or reads any existing table.

-- ── the staff roster ─────────────────────────────────────────────────────
create table if not exists staff_accounts (
  id          text primary key,          -- 8767569788:counter — phone plus role
  phone       text not null,
  name        text not null,
  role        text not null,             -- counter | chef | kitchen_manager | owner
  shop        text,                      -- S1 | S2 | K1 | '*' for all shops
  pin_hash    text,                      -- null until the person sets it on first sign-in
  hidden      boolean default false,     -- never listed on the login screen
  temp        boolean default false,     -- a stand-in until the real person is appointed
  active      boolean default true,      -- deactivate rather than delete: punches must resolve
  updated_at  timestamptz default now()
);
alter table staff_accounts add column if not exists phone      text;
alter table staff_accounts add column if not exists name       text;
alter table staff_accounts add column if not exists role       text;
alter table staff_accounts add column if not exists shop       text;
alter table staff_accounts add column if not exists pin_hash   text;
-- The Google address that may open the app as this person. Its absence was a real fault,
-- not a tidiness one: the app writes this column when an owner grants Google access,
-- Postgres rejected the unknown column, sync marked the whole table unusable and dropped
-- the row — so the email stayed on the one phone it was typed into and every other device
-- answered "not on the staff list".
alter table staff_accounts add column if not exists email      text;
alter table staff_accounts add column if not exists hidden     boolean default false;
alter table staff_accounts add column if not exists temp       boolean default false;
alter table staff_accounts add column if not exists active     boolean default true;
alter table staff_accounts add column if not exists updated_at timestamptz default now();
create index if not exists idx_staff_accounts_phone on staff_accounts(phone);
create index if not exists idx_staff_accounts_email on staff_accounts(lower(email));

-- ── counter sales ────────────────────────────────────────────────────────
-- Every bill rung up at a till. One row per sale, items as jsonb, shop as our text code.
-- Without this table the owner screen has no revenue at all: the counter's pushes were
-- being refused by the other app's sales table.
create table if not exists cm_sales (
  id          text primary key,
  date        date not null,
  time        text,
  shop_id     text,
  staff       text,
  items       jsonb default '[]'::jsonb,
  sub         numeric default 0,
  disc        numeric default 0,
  total       numeric default 0,
  pay         text,
  note        text,
  is_test     boolean default false,
  updated_at  timestamptz default now()
);
alter table cm_sales add column if not exists time       text;
alter table cm_sales add column if not exists shop_id    text;
alter table cm_sales add column if not exists staff      text;
alter table cm_sales add column if not exists items      jsonb default '[]'::jsonb;
alter table cm_sales add column if not exists sub        numeric default 0;
alter table cm_sales add column if not exists disc       numeric default 0;
alter table cm_sales add column if not exists total      numeric default 0;
alter table cm_sales add column if not exists pay        text;
alter table cm_sales add column if not exists note       text;
alter table cm_sales add column if not exists is_test    boolean default false;
alter table cm_sales add column if not exists updated_at timestamptz default now();
create index if not exists idx_cm_sales_day on cm_sales(date, shop_id);

-- ── realtime ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['staff_accounts','cm_sales']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then
      raise notice 'realtime: % already published', t;
    end;
  end loop;
end $$;

-- ── rules ────────────────────────────────────────────────────────────────
-- This file used to DISABLE row level security on these two tables. Run after
-- supabase-harden-now.sql — which is the documented order — it silently undid the hardening
-- for the two most sensitive tables in the database: the staff roster holding PIN hashes,
-- and every till receipt. A setup script must never quietly widen access. These are the same
-- policies as harden-now, so the two files agree whichever order they run in.
do $$
declare t text;
begin
  foreach t in array array['staff_accounts','cm_sales']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_read on public.%I', t);
    execute format('drop policy if exists app_write on public.%I', t);
    execute format('drop policy if exists app_update on public.%I', t);
    execute format('create policy app_read   on public.%I for select to anon using (true)', t);
    execute format('create policy app_write  on public.%I for insert to anon with check (true)', t);
    execute format('create policy app_update on public.%I for update to anon using (true)', t);
    execute format('revoke delete on public.%I from anon', t);
  end loop;
end $$;

-- Still true, still worth writing down: the anon key can read pin_hash, because every phone
-- shares one key. Only per-staff Supabase Auth fixes that — see supabase-lockdown.sql, which
-- must not run until the app uses real accounts.
