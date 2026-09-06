-- ═════════════════════════════════════════════════════════════════
-- STAFF ROSTER — run this once, in Supabase → SQL Editor
-- ═════════════════════════════════════════════════════════════════
-- Adding this table is what moves staff out of the code. Until it exists, each device
-- seeds its own copy of the roster and a PIN set on one phone is unknown to the others.
-- After it exists: add a person once, on any device, and every device has them.
--
-- One row per person PER ROLE, because a number can hold more than one role and the PIN
-- typed decides which opens. id is phone:role.

create table if not exists staff (
  id          text primary key,          -- 8767569788:counter
  phone       text not null,
  name        text not null,
  role        text not null,             -- counter | chef | kitchen_manager | owner
  shop        text,                      -- S1 | S2 | K1 | '*' for all shops
  pin_hash    text,                      -- null until the person sets it on first sign-in
  hidden      boolean default false,     -- not listed on the login screen
  temp        boolean default false,     -- a stand-in until the real person is appointed
  active      boolean default true,      -- deactivate rather than delete: punches must keep resolving
  updated_at  timestamptz default now()
);

-- Existing project, older table: bring it up to shape without failing.
alter table staff add column if not exists phone      text;
alter table staff add column if not exists name       text;
alter table staff add column if not exists role       text;
alter table staff add column if not exists shop       text;
alter table staff add column if not exists pin_hash   text;
alter table staff add column if not exists hidden     boolean default false;
alter table staff add column if not exists temp       boolean default false;
alter table staff add column if not exists active     boolean default true;
alter table staff add column if not exists updated_at timestamptz default now();

create index if not exists idx_staff_phone on staff(phone);

-- Realtime, so a PIN set on the kitchen phone is known to the shop phone at once.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table staff';
  exception when others then
    raise notice 'realtime: staff already published';
  end;
end $$;

-- Rules stay off until supabase-lockdown.sql runs. Note for that file: pin_hash must never
-- be readable by the anon key once staff have real identities.
alter table staff disable row level security;
