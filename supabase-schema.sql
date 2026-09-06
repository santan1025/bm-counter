-- ═══════════════════════════════════════════════════════════════════════════
-- BM VENTURES — SCHEMA  (paste into your EXISTING Supabase project → SQL Editor → Run)
-- ═══════════════════════════════════════════════════════════════════════════
-- Safe to run on the project the counter app already syncs to. Every statement is
-- create-if-not-exists; the existing cm_records table is not touched, renamed or read.
-- The counter app keeps using cm_records until it is moved over table by table.
-- ═══════════════════════════════════════════════════════════════════════════
-- Deliberately loose: text ids, jsonb payloads, few constraints. The workflow is still
-- being discovered at the shop, and a schema that argues with tomorrow's discovery gets
-- worked around rather than corrected. Tighten once the real shape stops moving.

-- Nothing here is used by the app at runtime — shop names live in session.js — but a shops
-- table is useful for reports later. Your project already has one from the Next.js repo
-- with different columns, so this is written to adapt rather than fail: missing columns are
-- added, and if the existing table is incompatible (a uuid primary key, say) the seed rows
-- are skipped with a notice instead of stopping the script.
create table if not exists shops (
  id          text primary key,
  name        text not null,
  is_kitchen  boolean default false
);

alter table shops add column if not exists name       text;
alter table shops add column if not exists is_kitchen boolean default false;

do $$
begin
  insert into shops (id, name, is_kitchen) values
    ('S1','MS Clubhouse',false),
    ('S2','Mulund Store',false),
    ('K1','Rabale Kitchens',true)
  on conflict (id) do nothing;
exception when others then
  raise notice 'shops seed skipped (existing table is a different shape): %', sqlerrm;
end $$;

-- Shop asks the kitchen for stock. Replaces the WhatsApp message.
create table if not exists requests (
  id          text primary key,
  date        date not null,
  time        text,
  shop_id     text,
  shop_name   text,
  by_staff    text,
  via         text,
  status      text default 'new',      -- new | packing | dispatched
  items       jsonb default '[]',      -- [{name,cat,price,ask,packed}]
  sent_at     text,
  inv_no      text,
  total       numeric default 0,
  updated_at  timestamptz default now()
);

-- What actually left the kitchen, and its invoice. The record nobody may edit later.
create table if not exists dispatches (
  id          text primary key,
  req_id      text,
  date        date not null,
  time        text,
  inv_no      text,
  shop_id     text,
  shop_name   text,
  total       numeric default 0,
  items       jsonb default '[]',
  updated_at  timestamptz default now()
);

-- Counter sales. Two devices in one shop share this list.
create table if not exists sales (
  id          text primary key,
  date        date not null,
  time        text,
  shop_id     text,
  staff       text,
  items       jsonb default '[]',
  sub         numeric default 0,
  disc        numeric default 0,
  total       numeric default 0,
  pay         text,
  note        text,
  is_test     boolean default false,
  updated_at  timestamptz default now()
);

-- Live stock per shop. One row per shop per product.
create table if not exists stock (
  id          text primary key,          -- shop_id || ':' || product_id
  shop_id     text,
  product_id  text,
  name        text,
  cat         text,
  qty         numeric default 0,
  low_at      numeric default 0,
  locked_qty  numeric default 0,         -- booked for special orders, not sellable
  updated_at  timestamptz default now()
);

-- Special / corporate orders. The fields are the ones the chef cannot guess.
create table if not exists special_orders (
  id            text primary key,
  taken_date    date,
  taken_by      text,
  shop_id       text,
  shop_name     text,
  customer      text,
  phone         text,
  needed_date   date,
  needed_time   text,
  product       text,
  flavour       text,
  weight        text,
  shape         text,
  eggless       boolean default false,
  colour        text,
  message_on    text,                    -- what is written on the cake
  allergy       text,
  photo_url     text,
  notes         text,
  price         numeric default 0,
  advance       numeric default 0,
  advance_date  date,
  balance       numeric default 0,
  status        text default 'booked',   -- booked | making | ready | collected | not_collected | cancelled
  updated_at    timestamptz default now()
);

-- Attendance. Salary is calculated from this, so it is append-only in practice.
create table if not exists punches (
  id           text primary key,
  staff_phone  text,
  staff_name   text,
  role         text,
  shop_id      text,
  date         date,
  in_at        timestamptz,
  out_at       timestamptz,
  in_verified  boolean default false,    -- location confirmed at punch-in
  out_auto     boolean default false,    -- closed by midnight, not by the person
  updated_at   timestamptz default now()
);

-- Expenses, so profit is revenue minus what it actually cost to trade. Kitchen expenses
-- were entirely untracked before this system.
create table if not exists expenses (
  id          text primary key,
  date        date not null,
  time        text,
  shop_id     text,
  cat         text,
  descr       text,
  amt         numeric default 0,
  source      text,                      -- cashbox | upi | owner
  staff       text,
  is_test     boolean default false,
  updated_at  timestamptz default now()
);

-- Wastage. In a cake shop this is the difference between a good month and a bad one.
create table if not exists damage (
  id          text primary key,
  date        date not null,
  shop_id     text,
  name        text,
  cat         text,
  qty         numeric default 0,
  value       numeric default 0,
  age_days    numeric default 0,
  reason      text,
  is_test     boolean default false,
  updated_at  timestamptz default now()
);

-- One row per shop per day: the close, the counted cash, the opening and closing stock.
-- This is what tells the owner a day was actually closed rather than abandoned.
create table if not exists daybook (
  id            text primary key,        -- shop_id || ':' || date
  date          date not null,
  shop_id       text,
  closed        boolean default false,
  closed_at     timestamptz,
  closed_by     text,
  cash_counted  numeric,
  cash_expected numeric,
  opening_value numeric,
  closing_value numeric,
  cashbox       numeric,
  updated_at    timestamptz default now()
);

create table if not exists notifications (
  id          text primary key,
  created_at  timestamptz default now(),
  kind        text,                      -- restock_sent | dispatched | order_due | out_of_stock | short | punch | day_close | advance
  urgent      boolean default false,
  shop_id     text,
  for_role    text,                      -- counter | chef | kitchen_manager | owner | all
  title       text,
  body        text,
  read_by     jsonb default '[]',
  updated_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Bring existing tables up to date
-- ═══════════════════════════════════════════════════════════════════════════
-- This project already carries tables from the Next.js repo — shops, and possibly others —
-- and create-if-not-exists does nothing at all when a table of that name exists, even if
-- it has none of the columns this system needs. So every column is declared again here.
-- Each line is a no-op once satisfied, which is what keeps this whole file safe to re-run
-- after any change.
--
-- This block must come BEFORE the indexes: an index on a column that does not exist yet is
-- what failed the first two attempts.

alter table requests       add column if not exists date       date;
alter table requests       add column if not exists time       text;
alter table requests       add column if not exists shop_id    text;
alter table requests       add column if not exists shop_name  text;
alter table requests       add column if not exists by_staff   text;
alter table requests       add column if not exists via        text;
alter table requests       add column if not exists status     text default 'new';
alter table requests       add column if not exists items      jsonb default '[]';
alter table requests       add column if not exists sent_at    text;
alter table requests       add column if not exists inv_no     text;
alter table requests       add column if not exists total      numeric default 0;
alter table requests       add column if not exists updated_at timestamptz default now();

alter table dispatches     add column if not exists req_id     text;
alter table dispatches     add column if not exists date       date;
alter table dispatches     add column if not exists time       text;
alter table dispatches     add column if not exists inv_no     text;
alter table dispatches     add column if not exists shop_id    text;
alter table dispatches     add column if not exists shop_name  text;
alter table dispatches     add column if not exists total      numeric default 0;
alter table dispatches     add column if not exists items      jsonb default '[]';
alter table dispatches     add column if not exists updated_at timestamptz default now();

alter table sales          add column if not exists date       date;
alter table sales          add column if not exists time       text;
alter table sales          add column if not exists shop_id    text;
alter table sales          add column if not exists staff      text;
alter table sales          add column if not exists items      jsonb default '[]';
alter table sales          add column if not exists sub        numeric default 0;
alter table sales          add column if not exists disc       numeric default 0;
alter table sales          add column if not exists total      numeric default 0;
alter table sales          add column if not exists pay        text;
alter table sales          add column if not exists note       text;
alter table sales          add column if not exists is_test    boolean default false;
alter table sales          add column if not exists updated_at timestamptz default now();

alter table stock          add column if not exists shop_id    text;
alter table stock          add column if not exists product_id text;
alter table stock          add column if not exists name       text;
alter table stock          add column if not exists cat        text;
alter table stock          add column if not exists qty        numeric default 0;
alter table stock          add column if not exists low_at     numeric default 0;
alter table stock          add column if not exists price      numeric default 0;
alter table stock          add column if not exists cost       numeric default 0;
alter table stock          add column if not exists locked_qty numeric default 0;
alter table stock          add column if not exists updated_at timestamptz default now();

alter table special_orders add column if not exists taken_date   date;
alter table special_orders add column if not exists taken_by     text;
alter table special_orders add column if not exists shop_id      text;
alter table special_orders add column if not exists shop_name    text;
alter table special_orders add column if not exists customer     text;
alter table special_orders add column if not exists phone        text;
alter table special_orders add column if not exists needed_date  date;
alter table special_orders add column if not exists needed_time  text;
alter table special_orders add column if not exists product      text;
alter table special_orders add column if not exists flavour      text;
alter table special_orders add column if not exists weight       text;
alter table special_orders add column if not exists shape        text;
alter table special_orders add column if not exists eggless      boolean default false;
alter table special_orders add column if not exists colour       text;
alter table special_orders add column if not exists message_on   text;
alter table special_orders add column if not exists allergy      text;
alter table special_orders add column if not exists photo_url    text;
alter table special_orders add column if not exists notes        text;
alter table special_orders add column if not exists price        numeric default 0;
alter table special_orders add column if not exists advance      numeric default 0;
alter table special_orders add column if not exists advance_date date;
alter table special_orders add column if not exists balance      numeric default 0;
alter table special_orders add column if not exists status       text default 'booked';
alter table special_orders add column if not exists updated_at   timestamptz default now();

alter table punches        add column if not exists staff_phone text;
alter table punches        add column if not exists staff_name  text;
alter table punches        add column if not exists role        text;
alter table punches        add column if not exists shop_id     text;
alter table punches        add column if not exists date        date;
alter table punches        add column if not exists in_at       timestamptz;
alter table punches        add column if not exists out_at      timestamptz;
alter table punches        add column if not exists in_verified boolean default false;
alter table punches        add column if not exists out_auto    boolean default false;
alter table punches        add column if not exists assumed     boolean default false;
alter table punches        add column if not exists updated_at  timestamptz default now();

alter table expenses       add column if not exists date       date;
alter table expenses       add column if not exists time       text;
alter table expenses       add column if not exists shop_id    text;
alter table expenses       add column if not exists cat        text;
alter table expenses       add column if not exists descr      text;
alter table expenses       add column if not exists amt        numeric default 0;
alter table expenses       add column if not exists source     text;
alter table expenses       add column if not exists staff      text;
alter table expenses       add column if not exists is_test    boolean default false;
alter table expenses       add column if not exists updated_at timestamptz default now();

alter table damage         add column if not exists date       date;
alter table damage         add column if not exists shop_id    text;
alter table damage         add column if not exists name       text;
alter table damage         add column if not exists cat        text;
alter table damage         add column if not exists qty        numeric default 0;
alter table damage         add column if not exists value      numeric default 0;
alter table damage         add column if not exists age_days   numeric default 0;
alter table damage         add column if not exists reason     text;
alter table damage         add column if not exists is_test    boolean default false;
alter table damage         add column if not exists updated_at timestamptz default now();

alter table daybook        add column if not exists date          date;
alter table daybook        add column if not exists shop_id       text;
alter table daybook        add column if not exists closed        boolean default false;
alter table daybook        add column if not exists closed_at     timestamptz;
alter table daybook        add column if not exists closed_by     text;
alter table daybook        add column if not exists cash_counted  numeric;
alter table daybook        add column if not exists cash_expected numeric;
alter table daybook        add column if not exists opening_value numeric;
alter table daybook        add column if not exists closing_value numeric;
alter table daybook        add column if not exists cashbox       numeric;
alter table daybook        add column if not exists updated_at    timestamptz default now();

alter table notifications  add column if not exists created_at timestamptz default now();
alter table notifications  add column if not exists kind       text;
alter table notifications  add column if not exists urgent     boolean default false;
alter table notifications  add column if not exists shop_id    text;
alter table notifications  add column if not exists for_role   text;
alter table notifications  add column if not exists title      text;
alter table notifications  add column if not exists body       text;
alter table notifications  add column if not exists read_by    jsonb default '[]';
alter table notifications  add column if not exists updated_at timestamptz default now();

-- Indexes last, now that every column they name is guaranteed to exist.
create index if not exists idx_req_date  on requests(date);
create index if not exists idx_disp_date on dispatches(date);
create index if not exists idx_sales_day on sales(date, shop_id);
create index if not exists idx_stock_shop on stock(shop_id);
create index if not exists idx_spec_need on special_orders(needed_date, status);
create index if not exists idx_punch_day on punches(date, staff_phone);
create index if not exists idx_exp_day   on expenses(date, shop_id);
create index if not exists idx_dmg_day   on damage(date, shop_id);
create index if not exists idx_book_day  on daybook(date, shop_id);

-- Realtime: without this the screens still load, but nothing updates by itself. Adding a
-- table that is already published raises an error, which on a re-run would stop the script
-- — so each one is added independently and an "already there" is ignored.
do $$
declare t text;
begin
  foreach t in array array['requests','dispatches','sales','stock','special_orders',
                           'punches','notifications','expenses','damage','daybook']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then
      raise notice 'realtime: % already published or unavailable', t;
    end;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TESTING PHASE: rules off so two devices can talk immediately.
-- ═══════════════════════════════════════════════════════════════════════════
-- Only the tables this system owns. Anything else already in the project is left exactly
-- as it is — turning someone else's security off by accident is not a risk worth taking.
do $$
declare t text;
begin
  foreach t in array array['requests','dispatches','sales','stock','special_orders',
                           'punches','notifications','expenses','damage','daybook']
  loop
    execute format('alter table %I disable row level security', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠ BEFORE ANY REAL SALE GOES IN — run lockdown.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- With rules off, anyone holding the anon key can read every shop's figures. That is
-- acceptable for a test on your own two devices and unacceptable the moment the client's
-- staff are using it. lockdown.sql is written and waiting; it is one paste.
