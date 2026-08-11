-- ============================================================================
-- Farewell Raffle — schema, seed, RLS, and RPC functions
-- Apply in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run: drops and recreates its own objects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sequences (registration order + spin order). Standalone so reset() controls
-- them explicitly.
-- ---------------------------------------------------------------------------
create sequence if not exists reg_seq start 1;
create sequence if not exists spin_seq start 1;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists registrants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- normalized name enforces case-insensitive, trimmed uniqueness at the DB
  -- level, which also backstops any registration race.
  name_norm     text not null unique,
  registered_at timestamptz not null default now(),
  seq           int  not null default nextval('reg_seq'),
  has_spun      boolean not null default false
);

create table if not exists prize_config (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  quantity int  not null check (quantity >= 0),
  is_shirt boolean not null default false,
  sort     int  not null default 0
);

-- The "raffle drum": one row per prize slot, generated at lock time.
create table if not exists prize_pool (
  id         uuid primary key default gen_random_uuid(),
  prize_name text not null,
  is_shirt   boolean not null default false,
  is_noprize boolean not null default false,
  claimed    boolean not null default false,
  claimed_by uuid references registrants(id) on delete set null
);
create index if not exists prize_pool_unclaimed_idx on prize_pool (claimed);

create table if not exists spin_results (
  id            uuid primary key default gen_random_uuid(),
  registrant_id uuid not null references registrants(id) on delete cascade,
  prize_name    text not null,
  is_shirt      boolean not null default false,
  is_noprize    boolean not null default false,
  spun_at       timestamptz not null default now(),
  seq           int not null default nextval('spin_seq')
);

-- Single-row event state.
create table if not exists event_state (
  id                   int primary key default 1 check (id = 1),
  registration_locked  boolean not null default false
);

-- Two-step go-live. Step 1 `registration_locked` freezes the list and builds
-- the pool; step 2 `wheel_open` actually enables spinning. (add-if-missing so
-- re-running this migration upgrades an existing table.)
alter table event_state
  add column if not exists wheel_open boolean not null default false;

-- ---------------------------------------------------------------------------
-- Seed: exactly one event_state row + the guaranteed T-Shirt x6 config row.
-- ---------------------------------------------------------------------------
insert into event_state (id, registration_locked)
values (1, false)
on conflict (id) do nothing;

insert into prize_config (name, quantity, is_shirt, sort)
select 'T-Shirt', 6, true, 0
where not exists (select 1 from prize_config where is_shirt = true);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Browser (anon key) may READ everything (needed for realtime + page views)
-- but may only WRITE through the SECURITY DEFINER RPCs below. All privileged
-- admin writes go through server routes using the service_role key, which
-- bypasses RLS.
-- ---------------------------------------------------------------------------
alter table registrants  enable row level security;
alter table prize_config enable row level security;
alter table prize_pool   enable row level security;
alter table spin_results enable row level security;
alter table event_state  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['registrants','prize_config','prize_pool','spin_results','event_state']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select using (true)', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: register(name) — public. Handles lock check, dedupe, and ordering
-- atomically. Returns a small jsonb result the client can branch on.
-- ---------------------------------------------------------------------------
create or replace function register(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_norm   text := lower(btrim(coalesce(p_name, '')));
  v_locked boolean;
  v_id     uuid;
  v_seq    int;
begin
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;

  select registration_locked into v_locked from event_state where id = 1;
  if v_locked then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  begin
    insert into registrants (name, name_norm)
    values (v_name, v_norm)
    returning id, seq into v_id, v_seq;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name, 'seq', v_seq);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: lock_registration() — admin (called via service_role server route).
-- Validates headcount vs. configured prizes, then builds the fixed-size pool:
--   6 shirts + fillers at exact configured quantity + "No prize" padding = N.
-- Does NOT lock (returns ok:false) if it can't guarantee a valid pool.
-- ---------------------------------------------------------------------------
create or replace function lock_registration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n        int;
  v_fillers  int;
  v_noprize  int;
  r          record;
begin
  select count(*) into v_n from registrants;

  if v_n < 6 then
    return jsonb_build_object(
      'ok', false, 'reason', 'too_few',
      'n', v_n,
      'message', format('Only %s registered — need at least 6 to guarantee all shirts.', v_n)
    );
  end if;

  select coalesce(sum(quantity), 0) into v_fillers
  from prize_config where is_shirt = false;

  if 6 + v_fillers > v_n then
    return jsonb_build_object(
      'ok', false, 'reason', 'oversubscribed',
      'n', v_n, 'shirts', 6, 'fillers', v_fillers,
      'message', format(
        'Too many prizes: 6 shirts + %s fillers = %s > %s people. Reduce filler quantities.',
        v_fillers, 6 + v_fillers, v_n)
    );
  end if;

  v_noprize := v_n - 6 - v_fillers;

  -- (Re)build the pool from scratch. (WHERE true satisfies safe-update mode.)
  delete from prize_pool where true;

  -- 6 shirts
  insert into prize_pool (prize_name, is_shirt, is_noprize)
  select 'T-Shirt', true, false from generate_series(1, 6);

  -- fillers at their exact configured quantities
  for r in
    select name, quantity from prize_config
    where is_shirt = false and quantity > 0
  loop
    insert into prize_pool (prize_name, is_shirt, is_noprize)
    select r.name, false, false from generate_series(1, r.quantity);
  end loop;

  -- "No prize" padding to reach exactly N slots
  if v_noprize > 0 then
    insert into prize_pool (prize_name, is_shirt, is_noprize)
    select 'No prize', false, true from generate_series(1, v_noprize);
  end if;

  update event_state set registration_locked = true where id = 1;

  return jsonb_build_object(
    'ok', true, 'n', v_n, 'shirts', 6,
    'fillers', v_fillers, 'noprize', v_noprize
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: unlock_registration() — admin. Reopens registration and discards the
-- generated pool (nothing should have been spun yet, but be defensive).
-- ---------------------------------------------------------------------------
create or replace function unlock_registration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select wheel_open from event_state where id = 1) then
    return jsonb_build_object('ok', false, 'reason', 'wheel_open',
      'message', 'Disable the wheel before reopening registration.');
  end if;
  if exists (select 1 from spin_results) then
    return jsonb_build_object('ok', false, 'reason', 'already_spun',
      'message', 'Cannot unlock — spins have already happened. Reset instead.');
  end if;
  delete from prize_pool where true;
  update event_state set registration_locked = false where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: open_wheel() / close_wheel() — admin. Step 2 of go-live: flip the wheel
-- on (spinning allowed) or back off (only before any spins).
-- ---------------------------------------------------------------------------
create or replace function open_wheel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select registration_locked from event_state where id = 1) then
    return jsonb_build_object('ok', false, 'reason', 'not_locked',
      'message', 'Lock registration first.');
  end if;
  if not exists (select 1 from prize_pool) then
    return jsonb_build_object('ok', false, 'reason', 'no_pool',
      'message', 'No prize pool — unlock and re-lock to rebuild it.');
  end if;
  update event_state set wheel_open = true where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function close_wheel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from spin_results) then
    return jsonb_build_object('ok', false, 'reason', 'already_spun',
      'message', 'Spins have started — reset to undo.');
  end if;
  update event_state set wheel_open = false where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: spin(registrant) — public. The atomic live draw (spec §5.3, §6).
-- One transaction: guard against double-spin, draw one uniform-random
-- unclaimed slot (SKIP LOCKED for concurrency), claim it, record the result,
-- flag the registrant. Server-authoritative — hold-to-charge cannot influence.
-- ---------------------------------------------------------------------------
create or replace function spin(p_registrant uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open    boolean;
  v_spun    boolean;
  v_slot    prize_pool%rowtype;
  v_seq     int;
begin
  select wheel_open into v_open from event_state where id = 1;
  if not v_open then
    return jsonb_build_object('ok', false, 'reason', 'wheel_closed');
  end if;

  -- Lock the registrant row so concurrent/duplicate clicks serialize here.
  select has_spun into v_spun
  from registrants where id = p_registrant
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_registrant');
  end if;
  if v_spun then
    return jsonb_build_object('ok', false, 'reason', 'already_spun');
  end if;

  -- Draw one unclaimed slot uniformly at random; SKIP LOCKED avoids two
  -- simultaneous spins contending for the same row.
  select * into v_slot
  from prize_pool
  where not claimed
  order by random()
  limit 1
  for update skip locked;

  if not found then
    -- Pool exhausted (should not happen: one slot per registrant).
    return jsonb_build_object('ok', false, 'reason', 'pool_empty');
  end if;

  update prize_pool
  set claimed = true, claimed_by = p_registrant
  where id = v_slot.id;

  insert into spin_results (registrant_id, prize_name, is_shirt, is_noprize)
  values (p_registrant, v_slot.prize_name, v_slot.is_shirt, v_slot.is_noprize)
  returning seq into v_seq;

  update registrants set has_spun = true where id = p_registrant;

  return jsonb_build_object(
    'ok', true,
    'prizeName', v_slot.prize_name,
    'isShirt', v_slot.is_shirt,
    'isNoPrize', v_slot.is_noprize,
    'seq', v_seq
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: reset_event() — admin. Wipes registrants, pool, and results; restores
-- the seed T-Shirt x6 config; unlocks. Destructive (confirmed in the UI).
-- ---------------------------------------------------------------------------
create or replace function reset_event()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate spin_results, prize_pool, registrants restart identity cascade;
  perform setval('reg_seq', 1, false);
  perform setval('spin_seq', 1, false);

  delete from prize_config where true;
  insert into prize_config (name, quantity, is_shirt, sort)
  values ('T-Shirt', 6, true, 0);

  update event_state set registration_locked = false, wheel_open = false where id = 1;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the two public RPCs are callable with the anon key. All admin
-- RPCs are invoked from server routes via the service_role key.
-- ---------------------------------------------------------------------------
revoke all on function register(text)          from anon, authenticated;
revoke all on function spin(uuid)              from anon, authenticated;
revoke all on function lock_registration()     from anon, authenticated;
revoke all on function unlock_registration()   from anon, authenticated;
revoke all on function open_wheel()            from anon, authenticated;
revoke all on function close_wheel()           from anon, authenticated;
revoke all on function reset_event()           from anon, authenticated;

grant execute on function register(text) to anon, authenticated;
grant execute on function spin(uuid)     to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: publish the tables the monitor + wheel subscribe to.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['registrants','prize_config','prize_pool','spin_results','event_state']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then
      -- already in the publication
      null;
    end;
  end loop;
end $$;
