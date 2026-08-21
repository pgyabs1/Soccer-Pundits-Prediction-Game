-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste all -> Run

create table players (
  id bigint generated always as identity primary key,
  name text unique not null,
  pin text not null,
  created_at timestamptz default now()
);

create table gameweeks (
  id bigint generated always as identity primary key,
  number int unique not null,
  lock_at timestamptz,
  finalized boolean default false,
  created_at timestamptz default now()
);

create table fixtures (
  id bigint generated always as identity primary key,
  gameweek_id bigint references gameweeks(id) on delete cascade,
  home text not null,
  away text not null,
  result_home int,
  result_away int
);

create table predictions (
  id bigint generated always as identity primary key,
  fixture_id bigint references fixtures(id) on delete cascade,
  player_name text not null,
  pred_home int not null,
  pred_away int not null,
  created_at timestamptz default now(),
  unique (fixture_id, player_name)
);

alter table players enable row level security;
alter table gameweeks enable row level security;
alter table fixtures enable row level security;
alter table predictions enable row level security;

-- Everyone (including anonymous visitors) can read gameweeks/fixtures/predictions
-- directly -- needed so the app works with no login.
create policy "public read gameweeks" on gameweeks for select using (true);
create policy "public read fixtures" on fixtures for select using (true);
create policy "public read predictions" on predictions for select using (true);

-- Deliberately NO public policies on the players table at all (no select,
-- no insert). Player names and PINs are only ever read or written through
-- the server-side /api/players and /api/join routes, using the service role
-- key -- this is what stops the PIN column from being readable by anyone
-- querying the anon key directly.

-- Anyone can submit or update prediction rows (trusted friend-group model,
-- same trust level as the original WhatsApp flow -- the PIN gate is what
-- now protects *which name* someone can submit under).
create policy "public insert predictions" on predictions for insert with check (true);
create policy "public update predictions" on predictions for update using (true);

-- Deliberately NO public insert/update policy on gameweeks or fixtures.
-- Those can only be written by the service role key, which only the
-- server-side /api/admin/* routes have access to (protected by ADMIN_PIN).
